// Tiny in-memory rate limiter (resets if the server restarts)
'use strict';
const hits = new Map();
const recent = (k, w) => { const now = Date.now(); const a = (hits.get(k) || []).filter(t => now - t < w); hits.set(k, a); return a; };
module.exports = {
  tooMany(key, max, windowMs) {            // check AND record
    const a = recent(key, windowMs);
    if (a.length >= max) return true;
    a.push(Date.now()); return false;
  },
  blocked(key, max, windowMs) { return recent(key, windowMs).length >= max; },   // check only
  record(key, windowMs) { recent(key, windowMs).push(Date.now()); }              // record only
};
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const f = v.filter(t => now - t < 3600000); f.length ? hits.set(k, f) : hits.delete(k); } }, 600000).unref();
