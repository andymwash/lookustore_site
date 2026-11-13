// ═══════════════════════════════════════════════════
//  LOOKU STORE — services/mpesa.js
//  Safaricom Daraja API — M-Pesa STK Push integration
//  Docs: https://developer.safaricom.co.ke/
// ═══════════════════════════════════════════════════
'use strict';

require('dotenv').config();

const ENV         = process.env.MPESA_ENVIRONMENT || 'sandbox'; // 'sandbox' | 'production'
const BASE_URL     = process.env.MPESA_BASE_URL || (ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke');

const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE       = process.env.MPESA_SHORTCODE;     // Paybill or Till number
const PASSKEY         = process.env.MPESA_PASSKEY;
const CALLBACK_URL    = process.env.MPESA_CALLBACK_URL;  // must be a public HTTPS URL

// ── In-memory token cache (valid ~1hr; re-fetch a little early) ──────
let cachedToken    = null;
let tokenExpiresAt = 0;

/**
 * Get (and cache) an OAuth access token from Daraja.
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not set in .env');
  }

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res  = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daraja auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken    = data.access_token;
  // Refresh 60s before actual expiry to be safe
  tokenExpiresAt = Date.now() + (parseInt(data.expires_in || '3599', 10) - 60) * 1000;
  return cachedToken;
}

/**
 * Build the Lipa Na M-Pesa password: Base64(Shortcode + Passkey + Timestamp)
 */
function buildPassword(timestamp) {
  if (!SHORTCODE || !PASSKEY) {
    throw new Error('MPESA_SHORTCODE / MPESA_PASSKEY are not set in .env');
  }
  return Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
}

/**
 * Daraja requires YYYYMMDDHHmmss
 */
function timestampNow() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

/**
 * Normalise a Kenyan phone number to 2547XXXXXXXX / 2541XXXXXXXX format.
 * Accepts: 0712345678, +254712345678, 254712345678, 712345678
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).trim().replace(/[\s-]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0'))  p = '254' + p.slice(1);
  if (p.startsWith('7') || p.startsWith('1')) p = '254' + p; // bare 7XXXXXXXX / 1XXXXXXXX
  if (!/^254(7|1)\d{8}$/.test(p)) return null;
  return p;
}

/**
 * Initiate an STK Push ("Lipa Na M-Pesa Online") request.
 * Customer receives a prompt on their phone to enter their M-Pesa PIN.
 *
 * @param {Object} opts
 * @param {string} opts.phone        Customer phone (any common Kenyan format)
 * @param {number} opts.amount       Amount in KSH (whole number, Safaricom rounds)
 * @param {string} opts.accountRef   Short reference shown to customer (e.g. order/sale ID)
 * @param {string} opts.description  Transaction description (max ~13 chars shown on some UIs)
 */
async function stkPush({ phone, amount, accountRef, description }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error(`Invalid phone number: "${phone}". Use format 07XXXXXXXX or 2547XXXXXXXX.`);
  }
  if (!CALLBACK_URL) {
    throw new Error('MPESA_CALLBACK_URL is not set in .env — Safaricom needs a public HTTPS URL to send results to.');
  }

  const token     = await getAccessToken();
  const timestamp = timestampNow();
  const password  = buildPassword(timestamp);

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline', // Till numbers: CustomerBuyGoodsOnline
    Amount:            Math.round(amount),
    PartyA:            normalizedPhone,
    PartyB:            process.env.MPESA_PARTY_B || SHORTCODE, // Till numbers: the Till number
    PhoneNumber:       normalizedPhone,
    CallBackURL:       CALLBACK_URL,
    AccountReference:  String(accountRef || 'LookuStore').slice(0, 12),
    TransactionDesc:   String(description || 'Looku Store Payment').slice(0, 13),
  };

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok || data.errorCode) {
    throw new Error(`STK Push failed: ${data.errorMessage || data.ResponseDescription || JSON.stringify(data)}`);
  }

  // Successful push acknowledgement (does NOT mean payment is done yet)
  // { MerchantRequestID, CheckoutRequestID, ResponseCode: "0", ResponseDescription, CustomerMessage }
  return data;
}

/**
 * Query the status of a previously sent STK Push (in case the callback was missed/delayed).
 */
async function stkQuery(checkoutRequestId) {
  const token     = await getAccessToken();
  const timestamp = timestampNow();
  const password  = buildPassword(timestamp);

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password:          password,
      Timestamp:          timestamp,
      CheckoutRequestID:  checkoutRequestId
    })
  });

  return res.json();
}

function isConfigured() {
  return !!(CONSUMER_KEY && CONSUMER_SECRET && SHORTCODE && PASSKEY && CALLBACK_URL);
}

module.exports = { getAccessToken, stkPush, stkQuery, normalizePhone, isConfigured };
