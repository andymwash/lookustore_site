// ═══════════════════════════════════════════════════
//  LOOKU STORE — data.js
//  Kenya Fashion & Clothing · KSH · Eldoret
// ═══════════════════════════════════════════════════

const MANAGER_CREDS = { username: "manager", password: "looku2026" };

// ── Default seed data ────────────────────────────────
const DEFAULT_PRODUCTS = [
  { id: 1, name: "Trouser",                    category: "Clothing", price: 400, stock: 20, icon: "👖" },
  { id: 2, name: "T-Shirt",                    category: "Clothing", price: 300, stock: 60, icon: "👕" },
  { id: 3, name: "Jersey (Man U)",             category: "Clothing", price: 800, stock: 2,  icon: "⚽" },
  { id: 4, name: "Jersey (Man City)",          category: "Clothing", price: 800, stock: 2,  icon: "⚽" },
  { id: 5, name: "Jersey (Kenya)",             category: "Clothing", price: 800, stock: 2,  icon: "⚽" },
  { id: 6, name: "Jersey (World Championship)",category: "Clothing", price: 800, stock: 1,  icon: "⚽" },
  { id: 7, name: "Hoody",                      category: "Clothing", price: 500, stock: 8,  icon: "🧥" },
  { id: 8, name: "Polo Shirt",                 category: "Clothing", price: 350, stock: 10, icon: "👕" },
  { id: 9, name: "Sweatpants",                 category: "Clothing", price: 400, stock: 16, icon: "👖" },
];

const DEFAULT_SALES = [];

const DEFAULT_ATTENDANTS = [
  { id: 1, username: "andrew", password: "andrew123", name: "Andrew Mwangi"  },
  { id: 2, username: "mwangi", password: "mwangi123", name: "Njuguna Mwangi" },
  { id: 3, username: "george", password: "george123", name: "George"         },
];

// ── localStorage keys ─────────────────────────────────
const KEYS = {
  products:      "looku_products",
  sales:         "looku_sales",
  attendants:    "looku_attendants",
  requests:      "looku_delete_requests",
  stockReports:  "looku_stock_reports",
};

function loadFromStorage(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) { return defaultValue; }
}

function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn("localStorage save failed:", e); }
}

// ── Live data ─────────────────────────────────────────
let products           = loadFromStorage(KEYS.products,      DEFAULT_PRODUCTS);
let sales              = loadFromStorage(KEYS.sales,         DEFAULT_SALES);
let ATTENDANT_ACCOUNTS = loadFromStorage(KEYS.attendants,    DEFAULT_ATTENDANTS);
let deleteRequests     = loadFromStorage(KEYS.requests,      []);
let stockReports       = loadFromStorage(KEYS.stockReports,  []);
let cart               = [];
let loggedInAttendant  = null;

function saveProducts()      { saveToStorage(KEYS.products,      products);           }
function saveSales()         { saveToStorage(KEYS.sales,         sales);              }
function saveAttendants()    { saveToStorage(KEYS.attendants,     ATTENDANT_ACCOUNTS); }
function saveRequests()      { saveToStorage(KEYS.requests,       deleteRequests);     }
function saveStockReports()  { saveToStorage(KEYS.stockReports,   stockReports);       }

// ── Helpers ───────────────────────────────────────────
function fmt(n) {
  return `KSH ${Number(n).toLocaleString("en-KE")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextId(arr) {
  return arr.length ? Math.max(...arr.map(i => i.id)) + 1 : 1;
}

function factoryReset() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  location.reload();
}


// ═══ PAYMENT DETAILS (shown to customers at checkout) ═══
const PAYMENT_INFO = {
  bank:          "Equity Bank",
  accountNumber: "0620185407864",
  accountName:   "ANDREW MWANGI",
  paybill:       "247247",          // Equity Paybill — confirm with Equity before relying on it
  whatsapp:      "254799836187"
};

function normalizeCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function codeUsed(code)   { return sales.some(s => s.payCode && normalizeCode(s.payCode) === code); }

function equityInstructionsHTML(total) {
  const P = PAYMENT_INFO;
  return `<div class="eq-box">
    <div class="eq-title">🏦 Pay to Looku Store — ${P.bank}</div>
    ${total ? `<div class="eq-row"><span>Amount to pay</span><strong>${fmt(total)}</strong></div>` : ""}
    <div class="eq-steps"><strong>Option 1 — M-Pesa</strong><br>Lipa na M-Pesa → Pay Bill → Business no. <strong>${P.paybill}</strong> → Account no. <strong>${P.accountNumber}</strong> → amount → PIN.</div>
    <div class="eq-steps"><strong>Option 2 — Bank transfer / deposit</strong><br>Account no. <strong>${P.accountNumber}</strong> · Name: <strong>${P.accountName}</strong></div>
    <div class="eq-note">Pay first, then enter the confirmation code from your SMS below.</div>
  </div>`;
}

// Merge duplicate category spellings (e.g. "Clothing" / "clothing") and trim names
(function cleanData() {
  const canon = {}; let changed = false;
  products.forEach(p => {
    const n = String(p.name || "").trim(), c = String(p.category || "").trim();
    const key = c.toLowerCase(); if (!canon[key]) canon[key] = c;
    if (n !== p.name || canon[key] !== p.category) { p.name = n; p.category = canon[key]; changed = true; }
  });
  if (changed) saveProducts();
})();

// ═══ Helpers for the delivery & feedback screens ═══
const SHOP_INFO = { address: "Next to Shell Petrol, Rupa's Mall, Eldoret" };   // shown to customers who choose pickup

// Escape text that came from another person (customer names, comments…) before putting it on a page
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
