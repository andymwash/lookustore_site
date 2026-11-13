'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');
const limits = require('./limits');
const { ah, clientIp } = require('./util');
const TEN_MIN = 10 * 60 * 1000;

// Text typed by other people: strip characters that could be used to inject HTML, then trim and cap the length.
const clean = (v, n) => String(v == null ? '' : v).replace(/[<>"`\\\u0000-\u001f]/g, '').trim().slice(0, n);
const normalizeCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ── passwords (scrypt, a standard slow hash — never stored in plain text) ──
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(pw) { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('hex')}$${(await scrypt(pw, salt)).toString('hex')}`; }
async function verifyPassword(pw, stored) {
  try {
    const [alg, s, h] = String(stored).split('$'); if (alg !== 'scrypt') return false;
    const k = await scrypt(pw, Buffer.from(s, 'hex')), hb = Buffer.from(h, 'hex');
    return hb.length === k.length && crypto.timingSafeEqual(hb, k);
  } catch (e) { return false; }
}

// ── login tokens ──
const secret = () => { const s = process.env.JWT_SECRET; return s && s.length >= 32 && !/^(change-me|type-a-long)/i.test(s) ? s : null; };
const signToken = u => jwt.sign({ sub: u.id, role: u.role, name: u.name }, secret(), { expiresIn: '12h' });

// Staff-only routes. requireStaff() = any logged-in staff; requireStaff('manager') = manager only.
// The account is re-checked in the database on every request, so removing someone locks them out immediately.
const requireStaff = (...roles) => ah(async (req, res, next) => {
  if (!secret()) return res.status(503).json({ success: false, code: 'NO_SECRET', message: 'The server is not fully set up yet (JWT_SECRET missing).' });
  const h = String(req.get('authorization') || ''), tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  let p; try { p = jwt.verify(tok, secret(), { algorithms: ['HS256'] }); } catch (e) { return res.status(401).json({ success: false, code: 'AUTH', message: 'Please log in again.' }); }
  const u = (await db.query('select id, name, username, role from staff where id = $1 and active', [p.sub])).rows[0];
  if (!u) return res.status(401).json({ success: false, code: 'AUTH', message: 'Please log in again.' });
  if (roles.length && !roles.includes(u.role)) return res.status(403).json({ success: false, message: 'You do not have permission to do that.' });
  req.user = u; req.staff = u.name;
  next();
});

// The one-time setup key (only used to create the very first manager account)
function setupKeyOk(given) {
  const key = process.env.SETUP_KEY;
  if (!key || key.length < 8 || /^change-me/i.test(key)) return null;            // null = not configured
  const a = Buffer.from(String(given || '')), b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { clean, normalizeCode, hashPassword, verifyPassword, signToken, secret, requireStaff, setupKeyOk, TEN_MIN, clientIp, limits };
