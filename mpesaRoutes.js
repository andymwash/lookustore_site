'use strict';
// PUBLIC: GET /pay/available · POST /pay/stk · GET /pay/status/:id · POST /callback (Safaricom)
// STAFF:  GET /transactions
const express = require('express');
const db = require('./db');
const mpesa = require('./mpesa');
const limits = require('./limits');
const { shopKey, TEN_MIN } = require('./auth');
const { ah, clientIp } = require('./util');

const router = express.Router();
const QUERY_AFTER_SEC = parseInt(process.env.MPESA_QUERY_AFTER_SEC || '12', 10);

// Settle a payment exactly once. Returns true only for the request that actually changed it.
async function settle(checkoutId, f) {
  const r = await db.query(`
    update mpesa_transactions
    set status = $1, result_code = $2, result_desc = $3,
        mpesa_receipt_number = coalesce($4, mpesa_receipt_number),
        transaction_date = coalesce($5, transaction_date),
        raw_callback = coalesce($6::jsonb, raw_callback), updated_at = now()
    where checkout_request_id = $7 and status = 'Pending' returning id`,
    [f.status, f.resultCode ?? null, f.resultDesc ?? null, f.receipt ?? null, f.txDate ?? null, f.raw ?? null, checkoutId]);
  return r.rows.length > 0;
}

router.get('/pay/available', (req, res) => res.json({ success: true, enabled: mpesa.isConfigured() }));

router.post('/pay/stk', ah(async (req, res) => {
  if (!mpesa.isConfigured()) return res.status(503).json({ success: false, code: 'NOT_CONFIGURED', message: 'Automatic payment is not available right now.' });
  const phone = mpesa.normalizePhone(req.body && req.body.phone), amount = Math.round(Number(req.body && req.body.amount));
  if (!phone) return res.status(400).json({ success: false, code: 'BAD_PHONE', message: 'Please enter a valid Safaricom number (e.g. 0712 345 678).' });
  if (!Number.isFinite(amount) || amount < 1 || amount > 150000) return res.status(400).json({ success: false, code: 'BAD_AMOUNT', message: 'Invalid amount.' });
  // stops anyone spamming payment prompts onto other people's phones
  if (await limits.tooMany('ip:' + clientIp(req), 10, TEN_MIN) || await limits.tooMany('ph:' + phone, 3, TEN_MIN)) {
    return res.status(429).json({ success: false, code: 'RATE_LIMIT', message: 'Too many attempts. Please wait a few minutes or pay manually.' });
  }
  try {
    const r = await mpesa.stkPush({ phone, amount, accountRef: 'LookuStore', description: 'Looku Store' });
    await db.query(`insert into mpesa_transactions (phone, amount, account_reference, merchant_request_id, checkout_request_id, status)
                    values ($1, $2, 'LookuStore', $3, $4, 'Pending')`, [phone, amount, r.MerchantRequestID, r.CheckoutRequestID]);
    res.json({ success: true, checkoutRequestId: r.CheckoutRequestID });
  } catch (err) {
    console.error('STK Push error:', err.message);                 // detail stays in the server log only
    res.status(502).json({ success: false, code: 'GATEWAY', message: 'Could not send the payment prompt.' });
  }
}));

const lastQuery = new Map();
router.get('/pay/status/:id', ah(async (req, res) => {
  const id = String(req.params.id);
  if (id.length > 100) return res.status(400).json({ success: false, message: 'Bad id.' });
  const sel = async () => (await db.query(`select status, amount::float8 as amount, mpesa_receipt_number, result_desc,
        extract(epoch from (now() - created_at)) as age from mpesa_transactions where checkout_request_id = $1`, [id])).rows[0];
  let t = await sel();
  if (!t) return res.status(404).json({ success: false, message: 'Not found.' });
  // If Safaricom's callback is late or lost, ask Safaricom directly instead of leaving the customer stuck.
  if (t.status === 'Pending' && Number(t.age) >= QUERY_AFTER_SEC && !((lastQuery.get(id) || 0) > Date.now() - 5000)) {
    lastQuery.set(id, Date.now());
    try {
      const q = await mpesa.stkQuery(id);
      if (q && q.ResultCode !== undefined && q.ResultCode !== null && q.ResultCode !== '') {
        const rc = Number(q.ResultCode);
        await settle(id, { status: rc === 0 ? 'Success' : (rc === 1032 ? 'Cancelled' : 'Failed'), resultCode: rc, resultDesc: q.ResultDesc });
        t = await sel();
      }
    } catch (e) { console.warn('stkQuery fallback failed:', e.message); }
  }
  res.json({ success: true, status: t.status, amount: t.amount, receipt: t.mpesa_receipt_number, message: t.result_desc });
}));

async function processCallback(body) {
  const cb = body && body.Body && body.Body.stkCallback;
  if (!cb) return;
  const txn = (await db.query('select status, amount::float8 as amount from mpesa_transactions where checkout_request_id = $1', [cb.CheckoutRequestID])).rows[0];
  if (!txn || txn.status !== 'Pending') return;                   // unknown, or already settled (Safaricom retries)
  if (Number(cb.ResultCode) !== 0) {
    await settle(cb.CheckoutRequestID, { status: Number(cb.ResultCode) === 1032 ? 'Cancelled' : 'Failed', resultCode: cb.ResultCode, resultDesc: cb.ResultDesc, raw: JSON.stringify(body) });
    return;
  }
  const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
  const get = n => { const i = items.find(x => x.Name === n); return i ? i.Value : undefined; };
  if (Number(get('Amount')) !== Number(txn.amount)) {
    await settle(cb.CheckoutRequestID, { status: 'Failed', resultCode: -1, resultDesc: 'Amount mismatch', raw: JSON.stringify(body) });
    return;
  }
  // The callback address is public, so anyone could post a fake "success". Confirm with Safaricom before trusting it.
  let verified = false;
  try { verified = String((await mpesa.stkQuery(cb.CheckoutRequestID)).ResultCode) === '0'; } catch (e) { console.warn('Callback verification failed:', e.message); }
  if (!verified) { console.warn('Callback not verified by Safaricom — left Pending'); return; }
  await settle(cb.CheckoutRequestID, { status: 'Success', resultCode: 0, resultDesc: cb.ResultDesc, receipt: get('MpesaReceiptNumber'), txDate: String(get('TransactionDate') || ''), raw: JSON.stringify(body) });
}

router.post('/callback', ah(async (req, res) => {
  // Serverless functions can be frozen the moment they reply, so finish the work BEFORE answering
  // (capped at 8s; if it doesn't finish, the status check above settles it from Safaricom directly).
  let timer;
  await Promise.race([
    processCallback(req.body).catch(e => console.error('Callback error:', e.message)),
    new Promise(r => { timer = setTimeout(r, 8000); }),
  ]);
  clearTimeout(timer);
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
}));

router.get('/transactions', shopKey, ah(async (req, res) => {
  const r = await db.query(`select id, phone, amount::float8 as amount, status, mpesa_receipt_number as receipt, result_desc, created_at
                            from mpesa_transactions order by id desc limit 100`);
  res.json({ success: true, data: r.rows });
}));

module.exports = router;
