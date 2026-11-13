'use strict';
// Online orders → delivery tracking → customer receipt → feedback  (Postgres version)
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const mpesa = require('./mpesa');
const limits = require('./limits');
const { shopKey, clean, TEN_MIN } = require('./auth');
const { ah, clientIp } = require('./util');

const router = express.Router();
const FLOW = {
  delivery: ['Placed', 'Confirmed', 'Packing', 'OutForDelivery', 'Delivered'],
  pickup:   ['Placed', 'Confirmed', 'Packing', 'ReadyForPickup', 'Collected'],
};
const DONE = ['Delivered', 'Collected'];
const ISSUES = ['wrong_item', 'wrong_size', 'damaged', 'late', 'poor_quality', 'rude_service', 'other'];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';               // no 0/O/1/I so codes are easy to read out
const ORDER_IP_MAX = () => parseInt(process.env.ORDER_IP_MAX || '6', 10);

const intIn = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const iso = d => (d ? new Date(d).toISOString() : null);
const newCode = () => { let c = 'LK-'; for (let i = 0; i < 5; i++) c += ALPHA[crypto.randomInt(ALPHA.length)]; return c; };
const NOT_FOUND = { success: false, message: 'We could not find that order. Check the code and the phone number you used.' };

const publicOrder = o => ({
  code: o.code, status: o.status, fulfilment: o.fulfilment, items: o.items, total: Number(o.total),
  paymentMethod: o.payment_method, paymentStatus: o.payment_status, location: o.customer_location,
  riderName: o.rider_name, riderPhone: o.rider_phone, etaNote: o.eta_note,
  receivedAt: iso(o.received_at), createdAt: iso(o.created_at), updatedAt: iso(o.updated_at),
});
const adminOrder = o => ({ ...publicOrder(o), id: o.id, customerName: o.customer_name, customerPhone: o.customer_phone,
  notes: o.notes, paymentRef: o.payment_ref, stockDeducted: !!o.stock_deducted });

const getById = async id => (await db.query('select * from orders where id = $1', [id])).rows[0];
async function findOrder(code, phone) {
  const p = mpesa.normalizePhone(phone);
  if (!p) return null;
  return (await db.query('select * from orders where code = $1 and customer_phone = $2', [clean(code, 20).toUpperCase(), p])).rows[0] || null;
}
// If an M-Pesa prompt payment confirmed after the order was placed, mark the order Paid.
async function reconcile(id) {
  await db.query(`
    with u as (
      update orders o set payment_status = 'Paid', payment_ref = coalesce(t.mpesa_receipt_number, o.payment_ref), updated_at = now()
      from mpesa_transactions t
      where o.payment_status = 'Pending' and o.mpesa_checkout_id is not null
        and t.checkout_request_id = o.mpesa_checkout_id and t.status = 'Success' and t.amount >= o.total
        and ($1::int is null or o.id = $1::int)
      returning o.id)
    insert into order_events (order_id, status, note, by_name) select id, 'Payment', 'Payment confirmed by M-Pesa', 'System' from u`, [id || null]);
}

// ═════════════ PUBLIC ═════════════
router.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const phone = mpesa.normalizePhone(b.phone), name = clean(b.name, 80);
  const fulfilment = b.fulfilment === 'pickup' ? 'pickup' : 'delivery';
  const location = clean(b.location, 200);
  if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });
  if (!phone) return res.status(400).json({ success: false, code: 'BAD_PHONE', message: 'Please enter a valid phone number (e.g. 0712 345 678).' });
  if (fulfilment === 'delivery' && !location) return res.status(400).json({ success: false, message: 'Delivery location is required.' });

  const raw = Array.isArray(b.items) ? b.items : [];
  if (raw.length < 1 || raw.length > 30) return res.status(400).json({ success: false, message: 'Order has no items.' });
  const items = [];
  for (const it of raw) {
    const qty = intIn(it && it.qty, 1, 50), price = Number(it && it.price), nm = clean(it && it.name, 80);
    if (!nm || qty === null || !Number.isFinite(price) || price < 0 || price > 1000000) return res.status(400).json({ success: false, message: 'Invalid items in order.' });
    items.push({ id: intIn(it.id, 1, 1e9), name: nm, qty, price });
  }
  const total = items.reduce((a, i) => a + i.qty * i.price, 0);       // never trust a total sent by the browser
  if (!(total >= 1)) return res.status(400).json({ success: false, message: 'Invalid order total.' });

  if (await limits.tooMany('ord-ip:' + clientIp(req), ORDER_IP_MAX(), TEN_MIN) || await limits.tooMany('ord-ph:' + phone, 6, TEN_MIN)) {
    return res.status(429).json({ success: false, code: 'RATE_LIMIT', message: 'Too many orders. Please wait a few minutes.' });
  }

  // Payment is only "Paid" if the server itself saw the M-Pesa payment succeed. The browser's word is not enough.
  const typedRef = clean(b.paymentRef, 40);
  let payStatus = 'Pending', payRef = typedRef, checkout = clean(b.mpesaCheckoutId, 100) || null;
  if (checkout) {
    const used = (await db.query('select 1 from orders where mpesa_checkout_id = $1', [checkout])).rows.length > 0;
    if (used) checkout = null;                                          // one payment, one order
    else {
      const t = (await db.query('select status, amount::float8 as amount, mpesa_receipt_number from mpesa_transactions where checkout_request_id = $1', [checkout])).rows[0];
      if (t && t.status === 'Success' && t.amount >= total) { payStatus = 'Paid'; payRef = t.mpesa_receipt_number || typedRef || 'STK'; }
    }
  }

  const note = fulfilment === 'pickup' ? 'Order placed — pickup at the shop' : 'Order placed — delivery';
  let code = null;
  for (let i = 0; i < 6 && !code; i++) {
    const c = newCode();
    try {
      await db.query(`
        with o as (
          insert into orders (code, customer_name, customer_phone, customer_location, notes, fulfilment, items, total,
                              payment_method, payment_status, payment_ref, mpesa_checkout_id)
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12) returning id)
        insert into order_events (order_id, status, note, by_name) select id, 'Placed', $13::text, 'Customer' from o`,
        [c, name, phone, location || null, clean(b.notes, 400) || null, fulfilment, JSON.stringify(items), total,
         clean(b.paymentMethod, 30) || null, payStatus, payRef || null, checkout, note]);
      code = c;
    } catch (e) {
      if (e.code !== '23505') throw e;                                  // unique clash: new code, or another order grabbed this payment first
      if (/mpesa_checkout/.test(String(e.constraint || e.detail || e.message))) { checkout = null; payStatus = 'Pending'; payRef = typedRef; }
    }
  }
  if (!code) return res.status(500).json({ success: false, message: 'Could not place the order. Please try again.' });
  res.status(201).json({ success: true, code, status: 'Placed', paymentStatus: payStatus, total });
}));

router.get('/track', ah(async (req, res) => {
  if (await limits.tooMany('trk:' + clientIp(req), 40, TEN_MIN)) return res.status(429).json({ success: false, message: 'Too many lookups. Please wait a few minutes.' });
  let o = await findOrder(req.query.code, req.query.phone);
  if (!o) return res.status(404).json(NOT_FOUND);
  await reconcile(o.id); o = await getById(o.id);
  const events = (await db.query('select status, note, created_at from order_events where order_id = $1 order by id', [o.id])).rows
    .map(e => ({ status: e.status, note: e.note, at: iso(e.created_at) }));
  const fb = (await db.query('select 1 from feedback where order_id = $1', [o.id])).rows.length > 0;
  res.json({ success: true, order: publicOrder(o), events, feedbackGiven: fb });
}));

router.post('/received', ah(async (req, res) => {
  if (await limits.tooMany('trk:' + clientIp(req), 40, TEN_MIN)) return res.status(429).json({ success: false, message: 'Too many attempts. Please wait a few minutes.' });
  const o = await findOrder(req.body && req.body.code, req.body && req.body.phone);
  if (!o) return res.status(404).json(NOT_FOUND);
  if (!DONE.includes(o.status)) return res.status(409).json({ success: false, message: "The shop hasn't marked this order as delivered yet." });
  const r = await db.query(`
    with u as (update orders set received_at = now(), updated_at = now() where id = $1 and received_at is null returning id)
    insert into order_events (order_id, status, note, by_name) select id, 'Received', 'Customer confirmed they received the order', 'Customer' from u returning order_id`, [o.id]);
  res.json(r.rows.length ? { success: true } : { success: true, already: true });
}));

router.post('/feedback', ah(async (req, res) => {
  if (await limits.tooMany('trk:' + clientIp(req), 40, TEN_MIN)) return res.status(429).json({ success: false, message: 'Too many attempts. Please wait a few minutes.' });
  const b = req.body || {}, o = await findOrder(b.code, b.phone);
  if (!o) return res.status(404).json(NOT_FOUND);
  if (!DONE.includes(o.status)) return res.status(409).json({ success: false, message: 'You can leave feedback once your order is delivered.' });
  const overall = intIn(b.overall, 1, 5);
  if (overall === null) return res.status(400).json({ success: false, message: 'Please choose an overall rating from 1 to 5.' });
  const delivery = o.fulfilment === 'delivery' ? intIn(b.delivery, 1, 5) : null;
  const itemOk = b.itemOk === true || b.itemOk === 'true' ? true : (b.itemOk === false || b.itemOk === 'false' ? false : null);
  const issues = [...new Set((Array.isArray(b.issues) ? b.issues : []).filter(i => ISSUES.includes(i)))];
  const r = await db.query(`insert into feedback (order_id, overall, delivery, item_ok, issues, comment)
        values ($1, $2, $3::smallint, $4::boolean, $5::jsonb, $6) on conflict (order_id) do nothing returning id`,
        [o.id, overall, delivery, itemOk, JSON.stringify(issues), clean(b.comment, 600) || null]);
  if (!r.rows.length) return res.status(409).json({ success: false, message: 'You have already sent feedback for this order. Thank you!' });
  await db.query(`insert into order_events (order_id, status, note, by_name) values ($1, 'Feedback', $2, 'Customer')`, [o.id, `Customer rated ${overall}/5`]);
  res.status(201).json({ success: true });
}));

// ═════════════ STAFF ═════════════
router.get('/admin/ping', shopKey, (req, res) => res.json({ success: true, staff: req.staff }));

router.get('/admin/list', shopKey, ah(async (req, res) => {
  await reconcile(null);
  const rows = (await db.query('select * from orders order by id desc limit 300')).rows;
  res.json({ success: true, data: rows.map(adminOrder) });
}));

router.patch('/admin/:id/status', shopKey, ah(async (req, res) => {
  const id = intIn(req.params.id, 1, 2147483647);
  const o = id && await getById(id);
  if (!o) return res.status(404).json({ success: false, message: 'Order not found.' });
  const b = req.body || {}, target = String(b.status || ''), flow = FLOW[o.fulfilment], note = clean(b.note, 300);
  let r;
  if (target === 'Cancelled') {
    if (DONE.includes(o.status) || o.status === 'Cancelled') return res.status(409).json({ success: false, message: `Order is already ${o.status}.` });
    if (o.status === 'OutForDelivery') return res.status(409).json({ success: false, message: 'The order is already out for delivery. Mark it delivered, or sort it out with the customer first.' });
    if (!note) return res.status(400).json({ success: false, message: 'Please give a reason for cancelling.' });
    r = await db.query(`with u as (update orders set status = 'Cancelled', updated_at = now() where id = $1 and status = $2 returning id)
        insert into order_events (order_id, status, note, by_name) select id, 'Cancelled', $3::text, $4::text from u returning order_id`, [id, o.status, note, req.staff]);
  } else {
    const i = flow.indexOf(o.status), j = flow.indexOf(target);
    if (j === -1 || i === -1 || j !== i + 1) return res.status(409).json({ success: false, message: `Cannot move this order from ${o.status} to ${target || '(none)'}.` });
    let rider = null;
    if (target === 'OutForDelivery') {
      rider = { name: clean(b.riderName, 60), phone: clean(b.riderPhone, 20), eta: clean(b.etaNote, 80) };
      if (!rider.name) return res.status(400).json({ success: false, message: "Please enter the rider's / delivery person's name." });
    }
    const evNote = note || (rider ? `Out for delivery with ${rider.name}${rider.eta ? ' — ' + rider.eta : ''}` : null);
    r = await db.query(`with u as (update orders set status = $3, rider_name = coalesce($4::text, rider_name), rider_phone = coalesce($5::text, rider_phone),
          eta_note = coalesce($6::text, eta_note), updated_at = now() where id = $1 and status = $2 returning id)
        insert into order_events (order_id, status, note, by_name) select id, $3::text, $7::text, $8::text from u returning order_id`,
        [id, o.status, target, rider && rider.name || null, rider && rider.phone || null, rider && rider.eta || null, evNote, req.staff]);
  }
  if (!r.rows.length) return res.status(409).json({ success: false, message: 'Someone else just changed this order. Refresh and try again.' });
  res.json({ success: true, data: adminOrder(await getById(id)) });
}));

router.patch('/admin/:id/payment', shopKey, ah(async (req, res) => {
  const id = intIn(req.params.id, 1, 2147483647), o = id && await getById(id);
  if (!o) return res.status(404).json({ success: false, message: 'Order not found.' });
  const status = String((req.body || {}).status || '');
  if (!['Paid', 'Pending', 'Failed'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be Paid, Pending or Failed.' });
  await db.query(`with u as (update orders set payment_status = $2, payment_ref = coalesce($3::text, payment_ref), updated_at = now() where id = $1 returning id)
      insert into order_events (order_id, status, note, by_name) select id, 'Payment', $4::text, $5::text from u`,
      [id, status, clean((req.body || {}).ref, 40) || null, `Payment marked ${status}`, req.staff]);
  res.json({ success: true, data: adminOrder(await getById(id)) });
}));

// Atomic claim, so two staff phones can never deduct stock for the same order twice.
router.post('/admin/:id/stock-deducted', shopKey, ah(async (req, res) => {
  const id = intIn(req.params.id, 1, 2147483647);
  const r = id ? await db.query('update orders set stock_deducted = true where id = $1 and stock_deducted = false returning id', [id]) : { rows: [] };
  if (!r.rows.length) return res.status(409).json({ success: false, already: true, message: 'Stock was already deducted for this order.' });
  res.json({ success: true });
}));

router.get('/admin/feedback', shopKey, ah(async (req, res) => {
  const rows = (await db.query(`select f.overall, f.delivery, f.item_ok, f.issues, f.comment, f.created_at,
        o.code, o.customer_name, o.customer_phone, o.fulfilment, o.total
        from feedback f join orders o on o.id = f.order_id order by f.id desc limit 300`)).rows;
  const data = rows.map(f => ({ code: f.code, customerName: f.customer_name, customerPhone: f.customer_phone, fulfilment: f.fulfilment, total: Number(f.total),
    overall: f.overall, delivery: f.delivery, itemOk: f.item_ok, issues: Array.isArray(f.issues) ? f.issues : [], comment: f.comment, createdAt: iso(f.created_at) }));
  const avg = a => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  const okVals = data.filter(d => d.itemOk !== null);
  const issueCounts = {}; data.forEach(d => d.issues.forEach(i => { issueCounts[i] = (issueCounts[i] || 0) + 1; }));
  res.json({ success: true, data, summary: { count: data.length, avgOverall: avg(data.map(d => d.overall)), avgDelivery: avg(data.filter(d => d.delivery).map(d => d.delivery)),
    itemOkPct: okVals.length ? Math.round(100 * okVals.filter(d => d.itemOk).length / okVals.length) : null, issueCounts } });
}));

module.exports = router;
