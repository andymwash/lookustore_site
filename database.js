// ═══════════════════════════════════════════════════
//  LOOKU STORE — config/database.js
//  SQLite database setup using Node 22 built-in sqlite
// ═══════════════════════════════════════════════════
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './looku_store.db';

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(path.resolve(DB_PATH));
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

// ── Create all tables ────────────────────────────────
function initDb() {
  const database = getDb();

  // Users table (managers + attendants)
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      username   TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL CHECK(role IN ('manager','attendant')),
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Products table
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      brand       TEXT,
      category    TEXT    NOT NULL,
      unit        TEXT,
      price       REAL    NOT NULL CHECK(price >= 0),
      stock       INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      description TEXT,
      image       TEXT,
      icon        TEXT    DEFAULT '👗',
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Sales table
  database.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      attendant_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      attendant_name    TEXT,
      customer_name     TEXT,
      customer_phone    TEXT,
      customer_location TEXT,
      customer_notes    TEXT,
      payment_method    TEXT    NOT NULL DEFAULT 'Cash',
      payment_status    TEXT    NOT NULL DEFAULT 'Paid',
      amount_paid       REAL,
      change_given      REAL,
      mobile_phone      TEXT,
      network           TEXT,
      card_ref          TEXT,
      total             REAL    NOT NULL,
      orig_total        REAL,
      discount          REAL    DEFAULT 0,
      sale_date         TEXT    DEFAULT (date('now')),
      created_at        TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Sale items table
  database.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT    NOT NULL,
      qty          INTEGER NOT NULL CHECK(qty > 0),
      unit_price   REAL    NOT NULL,
      orig_price   REAL,
      subtotal     REAL    NOT NULL
    )
  `);

  // Delete requests table
  database.exec(`
    CREATE TABLE IF NOT EXISTS delete_requests (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id     INTEGER REFERENCES products(id) ON DELETE CASCADE,
      product_name   TEXT    NOT NULL,
      requested_by   TEXT    NOT NULL,
      attendant_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason         TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at     TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Notifications table
  database.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      role       TEXT NOT NULL,
      message    TEXT NOT NULL,
      type       TEXT DEFAULT 'info',
      is_read    INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // M-Pesa transactions table — tracks every STK Push and its outcome
  database.exec(`
    CREATE TABLE IF NOT EXISTS mpesa_transactions (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id              INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      phone                TEXT    NOT NULL,
      amount               REAL    NOT NULL,
      account_reference    TEXT,
      merchant_request_id  TEXT,
      checkout_request_id  TEXT UNIQUE,
      status               TEXT    NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Success','Failed','Cancelled')),
      result_code          INTEGER,
      result_desc          TEXT,
      mpesa_receipt_number TEXT,
      transaction_date     TEXT,
      raw_callback         TEXT,
      created_at           TEXT DEFAULT (datetime('now')),
      updated_at           TEXT DEFAULT (datetime('now'))
    )
  `);

  // Customer orders with delivery tracking
  database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      code               TEXT    NOT NULL UNIQUE,
      customer_name      TEXT    NOT NULL,
      customer_phone     TEXT    NOT NULL,
      customer_location  TEXT,
      notes              TEXT,
      fulfilment         TEXT    NOT NULL DEFAULT 'delivery' CHECK(fulfilment IN ('delivery','pickup')),
      items_json         TEXT    NOT NULL,
      total              REAL    NOT NULL,
      payment_method     TEXT,
      payment_status     TEXT    NOT NULL DEFAULT 'Pending' CHECK(payment_status IN ('Pending','Paid','Failed')),
      payment_ref        TEXT,
      mpesa_checkout_id  TEXT,
      status             TEXT    NOT NULL DEFAULT 'Placed'
                         CHECK(status IN ('Placed','Confirmed','Packing','OutForDelivery','ReadyForPickup','Delivered','Collected','Cancelled')),
      rider_name         TEXT,
      rider_phone        TEXT,
      eta_note           TEXT,
      stock_deducted     INTEGER NOT NULL DEFAULT 0,
      received_at        TEXT,
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS order_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status     TEXT    NOT NULL,
      note       TEXT,
      by_name    TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      overall    INTEGER NOT NULL CHECK(overall BETWEEN 1 AND 5),
      delivery   INTEGER CHECK(delivery BETWEEN 1 AND 5),
      item_ok    INTEGER,
      issues     TEXT,
      comment    TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log('✅ Database tables ready');
  return database;
}

module.exports = { getDb, initDb };
