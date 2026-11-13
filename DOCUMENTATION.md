# LOOKU STORE — System Documentation
### Fashion & Clothing Retail Management System
**"Style for Every Story"** · Eldoret, Kenya 🇰🇪 · Currency: KSH

---

## 1. Overview

Looku Store is a full-stack retail management system built for a fashion and clothing
boutique in Eldoret, Kenya. It has three user roles — **Manager**, **Attendant**, and
**Customer** — and supports browsing, ordering, stock control, sales tracking, and
detailed stock reporting, with M-Pesa/Airtel Money/T-Kash payment support.

| | |
|---|---|
| **Store name** | Looku Store |
| **Tagline** | Style for Every Story |
| **Location** | Eldoret, Kenya (Uasin Gishu County) |
| **Currency** | KSH (Kenyan Shilling) |
| **WhatsApp** | 0799 836 187 |
| **Call** | 0799836187 |
| **Categories** | Women's Wear, Men's Wear, Kids' Wear, Footwear, Accessories, Sportswear |

---

## 2. Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   FRONTEND (Browser)     │  HTTP   │   BACKEND (Node.js)       │
│   looku-store/            │ ───────▶│   looku-store-backend/    │
│                           │         │                            │
│   index.html              │         │   server.js (Express)     │
│   style.css               │         │   routes/  (7 files)       │
│   app.js                  │         │   middleware/ (JWT auth)   │
│   data.js                 │         │   config/ (DB + seed)      │
└─────────────────────────┘         └──────────────────────────┘
                                                   │
                                                   ▼
                                       ┌──────────────────────────┐
                                       │  SQLite Database          │
                                       │  looku_store.db            │
                                       │  (Node 22 built-in sqlite) │
                                       └──────────────────────────┘
```

The frontend can run **standalone** (using `localStorage` for persistence) or be
**connected to the backend** (using the REST API + SQLite database) for multi-device,
shared data across the shop.

---

## 3. Folder Structure

### Frontend — `looku-store/`
| File | Purpose |
|---|---|
| `index.html` | All pages: landing, logins, dashboards, modals |
| `style.css` | All styling — layout, cards, lightbox, footer, PWA banner |
| `app.js` | All page logic — Manager, Attendant, Customer, Payment modal |
| `data.js` | Product catalogue, sample sales, `localStorage` persistence helpers |
| `manifest.json` | PWA manifest (installable app) |
| `sw.js` | Service worker — offline support |
| `sitemap.xml` / `robots.txt` | SEO crawler files |
| `looku_logo.png` | Store logo (also embedded as base64 in `index.html`) |
| `SEO-GUIDE.md` | Step-by-step guide to rank on Google |
| `README.md` | Frontend setup instructions |

### Backend — `looku-store-backend/`
| File | Purpose |
|---|---|
| `server.js` | Express entry point — boots DB, mounts routes, serves frontend |
| `package.json` | Dependencies |
| `.env.example` | Environment variable template |
| `config/database.js` | SQLite connection + table schema (6 tables) |
| `config/seed.js` | Seeds default users, 20 products, 6 sample sales |
| `middleware/auth.js` | JWT verification + role guard |
| `routes/auth.js` | Login / logout / current user |
| `routes/products.js` | Product CRUD + image upload |
| `routes/sales.js` | Sale recording, summary, payment status |
| `routes/users.js` | Attendant account management |
| `routes/notifications.js` | Per-role notification feed |
| `routes/deleteRequests.js` | Attendant delete requests → Manager approval |
| `routes/reports.js` | CSV exports + finance summary |

---

## 4. Roles & Access

| Role | Login Required | Username | Password | Access |
|---|---|---|---|---|
| **Manager** | Yes | `manager` | `looku2026` | Full system access |
| **Attendant** | Yes | `andrew` | `andrew123` | Sales, stock reports |
| **Attendant** | Yes | `kipchoge` | `kipchoge123` | Sales, stock reports |
| **Attendant** | Yes | `achieng` | `achieng123` | Sales, stock reports |
| **Customer** | No | — | — | Browse, order, enquire |

> ⚠️ Change these default passwords before going live with real customer data.

---

## 5. Manager Dashboard

Accessed via **Manager Login** → main dashboard with sidebar tabs:

| Tab | What it does |
|---|---|
| **Overview** | Revenue, sales count, items in stock, pending payments at a glance |
| **Sales Records** | Filter sales by payment method, delete individual sales, download CSV |
| **Finance** | Revenue breakdown by payment method and by attendant |
| **Stock Management** | Add new products (with image upload), edit or delete any product inline |
| **📋 Stock Reports** | Review every stock report submitted by attendants (see §7) |
| **⚠️ Requests** | Approve or reject attendant delete requests |
| **👥 Attendants** | Add or remove attendant accounts |
| **🔔 Notifications** | Bell icon feed — new orders, stock reports, delete requests |

### Stock Management — Add / Edit / Delete
- **Add Product**: name, brand, category, unit/size, price, stock, description, image
- **Image upload** via: file picker, camera capture, clipboard paste, or drag-and-drop
  (auto-compresses images over 1MB)
- **Edit**: click ✏️ on any row → inline edit form appears directly in the table
- **Delete**: click 🗑 → confirmation prompt → permanently removed

### Danger Zone
A "Reset All Data" button in Stock Management wipes all `localStorage` data and
restores the factory default catalogue. Used for testing/demos only.

---

## 6. Attendant Portal

Accessed via **Attendant Login** → dashboard with:

| Tab | What it does |
|---|---|
| **Record Sale** | Add items to a sale, adjust unit price (discounts), choose payment method |
| **Pending Payments** | Confirm or re-prompt customers awaiting M-Pesa confirmation |
| **Stock Management** | Submit full stock reports (see §7), request product deletion |
| **Notifications** | Bell feed — new orders assigned, manager responses |

### Recording a Sale
1. Select product(s) and quantity
2. Adjust unit price if a discount applies (original price shown struck-through)
3. Enter customer name, phone, location
4. Choose payment method: Cash / M-Pesa / Airtel Money / T-Kash / ATM-Card
5. Confirm — stock is deducted automatically, manager is notified

### Requesting a Deletion
Attendants cannot delete products directly. They submit a **Delete Request** with a
reason; it appears in the Manager's "⚠️ Requests" tab for approval or rejection.

---

## 7. Stock Reports — Full Detail

This is the core reporting tool for tracking every stock movement, used by both
attendants (to submit) and the manager (to review).

### Fields Captured Per Report

**Basic Info**
- Product, Date of stock entry, Supplier/source, Batch/Invoice number, Report type
  (New Stock In / Stock Update / Returned Stock / Damaged Stock / Stock Transfer)

**📦 Quantity Details**
- Total items received
- ✅ Perfect / good condition
- ⚠️ Imperfect / damaged
- ❌ Missing / short
- ↩️ Returned to supplier
- ➕ Items added to store stock (auto-calculated from "perfect", editable)
- Live variance check — flags if quantities don't add up to the total received

**🏷️ Quality Assessment**
- Overall quality grade: Excellent / Good / Average / Poor / Rejected
- Size/fit accuracy: Accurate / Runs Small / Runs Large / Mixed
- Fabric/material quality: Premium / Standard / Below Standard
- Colour/print accuracy: Accurate / Slight Variation / Different
- Free-text description of defects

**💰 Cost & Pricing**
- Cost per unit, Total cost (auto-calculated)
- Current selling price, Suggested new selling price

**📍 Storage**
- Storage location in store (e.g. "Rack A3")
- Storage condition: Good / Needs Improvement / Poor

**🚨 Reorder & Notes**
- Reorder urgency: Not Needed / Low / Medium / High / Critical
- Free-text notes/recommendations to the manager

### What Happens on Submit
1. Stock quantity is updated immediately (`previousStock` → `newStock`)
2. A detailed notification is pushed to the Manager's notification feed
3. The report is saved and appears in the Manager's **📋 Stock Reports** tab

### Manager's Stock Reports Tab
- **Summary stats**: total reports, unread/new, urgent reorders, poor-quality alerts,
  total items received, total imperfect items
- **Filters**: by report type, reorder urgency, attendant name
- **Report cards**: colour-coded quantity boxes, stock change arrow, quality/urgency
  badges, defects callout, notes callout
- **⬇️ Download CSV**: exports all 29 fields for every report (cost analysis, supplier
  tracking, quality audit trail, etc.)

---

## 8. Customer Portal (No Login Required)

| Feature | Description |
|---|---|
| **Browse** | Filter by category, search by name/brand/description |
| **Product Lightbox** | Tap any product image → full-screen view with Add to Cart |
| **Cart** | Add/remove items, adjust quantity |
| **3-Step Checkout** | 1) Review cart → 2) Enter details (name, phone, location) → 3) Payment |
| **Payment Options** | 💵 Cash (change calculated) · 📲 M-Pesa / Airtel Money / T-Kash · 💳 ATM/Card |
| **Order Confirmation** | Receipt screen with order summary |
| **WhatsApp Ordering** | Floating button → pre-filled message to 0799 836 187 |
| **Enquire** | Free-text form for sizing, colour, custom tailoring, bulk order questions |

---

## 9. Notifications System

In-app bell notifications, stored per-role:

| Trigger | Notified Role(s) |
|---|---|
| New customer order placed | Manager + Attendant |
| Payment confirmed | Customer |
| Stock report submitted | Manager |
| Delete request submitted | Manager |
| Delete request approved/rejected | Attendant |

---

## 10. Data Persistence

### Standalone mode (frontend only)
Uses browser `localStorage` under these keys:

| Key | Stores |
|---|---|
| `looku_products` | Product catalogue |
| `looku_sales` | All sales records |
| `looku_attendants` | Attendant accounts |
| `looku_delete_requests` | Pending/resolved delete requests |
| `looku_stock_reports` | All submitted stock reports |

> Data persists across browser sessions but is **local to that browser/device only**.
> For multi-device/shared data, connect the backend (§11).

### Connected mode (with backend)
All data lives in `looku_store.db` (SQLite), shared across every device that talks to
the backend API.

---

## 11. Backend API Reference

Base URL: `http://localhost:3000/api` (or your deployed domain)

All protected routes require header: `Authorization: Bearer <token>`

### Auth
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Returns JWT token + user info |
| GET | `/auth/me` | Any | Current logged-in user |
| POST | `/auth/logout` | Any | Logout (client discards token) |

### Products
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/products` | Public | All products (supports `?category=`, `?search=`, `?inStock=true`) |
| GET | `/products/categories` | Public | List of distinct categories |
| GET | `/products/:id` | Public | Single product |
| POST | `/products` | Manager | Add product (image: file upload or base64) |
| PUT | `/products/:id` | Manager | Edit product |
| DELETE | `/products/:id` | Manager | Delete product |
| POST | `/products/:id/stock` | Manager/Attendant | Adjust stock quantity |

### Sales
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/sales` | Manager/Attendant | All sales (filters: `?method=`, `?status=`, `?date=`, `?attendant=`) |
| GET | `/sales/summary` | Manager | Revenue totals, by-method, by-attendant, top products |
| GET | `/sales/:id` | Manager/Attendant | Single sale with items |
| POST | `/sales` | Any (auth) | Record new sale — validates stock, deducts automatically |
| PATCH | `/sales/:id/status` | Manager/Attendant | Update payment status (Paid/Pending/Failed) |
| DELETE | `/sales/:id` | Manager | Delete sale record |

### Users
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users` | Manager | All users |
| POST | `/users` | Manager | Create attendant account |
| PUT | `/users/:id` | Manager | Edit user |
| DELETE | `/users/:id` | Manager | Remove user |
| PATCH | `/users/:id/password` | Manager/Self | Change password |

### Notifications
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/notifications` | Any | Get by role (`?role=manager`) |
| PATCH | `/notifications/read` | Any | Mark all as read |
| DELETE | `/notifications` | Any | Clear all for role |

### Delete Requests
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/delete-requests` | Manager | All pending requests |
| POST | `/delete-requests` | Attendant | Submit a request |
| PATCH | `/delete-requests/:id` | Manager | `{ "action": "approve" }` or `"reject"` |

### Reports
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/reports/sales-csv` | Manager | Download sales CSV |
| GET | `/reports/restock-csv` | Manager | Download restock-suggestion CSV |
| GET | `/reports/finance` | Manager | Finance summary JSON (by method, by category) |

---

## 12. Database Schema

6 tables in `looku_store.db`:

| Table | Key Columns |
|---|---|
| `users` | id, name, username, password (bcrypt hash), role |
| `products` | id, name, brand, category, unit, price, stock, description, image, icon |
| `sales` | id, attendant_id/name, customer info, payment_method, payment_status, total, sale_date |
| `sale_items` | id, sale_id, product_id, product_name, qty, unit_price, subtotal |
| `delete_requests` | id, product_id, requested_by, reason, status |
| `notifications` | id, role, message, type, is_read, created_at |

---

## 13. Setup Instructions

### Frontend only (no backend)
```bash
# Just open index.html in any browser — no install needed
```
Data is stored in `localStorage`; works fully offline once loaded (PWA service worker
caches all assets).

### Full stack (frontend + backend)
```bash
# 1. Install Node.js v22 or higher — https://nodejs.org

# 2. Set up the backend
cd looku-store-backend
npm install
cp .env.example .env

# 3. Start the server (built-in SQLite flag required on Node 22)
node --experimental-sqlite server.js

# Server starts at http://localhost:3000
# Frontend is served automatically if looku-store/ sits alongside
# looku-store-backend/ in the same parent folder
```

### Folder layout expected by the backend
```
parent-folder/
├── looku-store/            ← frontend
└── looku-store-backend/    ← backend (server.js expects ../looku-store)
```

---

## 14. Deployment

| Component | Recommended Host | Notes |
|---|---|---|
| Frontend (standalone) | Netlify / GitHub Pages | Drag-and-drop the `looku-store` folder |
| Backend + DB | Render.com (free tier) | Start command: `node --experimental-sqlite server.js` |
| Domain | `.co.ke` via Safaricom Domains / Truehost Kenya | ~KSH 1,000–2,000/year |

See `SEO-GUIDE.md` inside the frontend folder for the full step-by-step plan covering:
Google Search Console, Google Business Profile, sitemap submission, and social media
setup.

---

## 15. Security Notes

- Passwords are stored as **bcrypt hashes** — never plain text
- Backend routes use **JWT tokens** (24-hour expiry by default)
- Role-based access control enforced server-side on every protected route
- In production: set `NODE_ENV=production`, restrict CORS to your real frontend domain
  (currently set to `*` for development), and change all default passwords

---

## 16. Known Limitations / Next Steps

- Frontend `localStorage` mode does **not** sync across devices — use the backend for
  multi-device/shared access
- M-Pesa integration is currently **simulated** (STK push message shown, no real
  Safaricom Daraja API call) — would need Daraja API credentials for live mobile money
- No automated test suite included
- No image CDN — uploaded images are stored locally in `/uploads` on the backend server

---

*Looku Store · Style for Every Story · Eldoret, Kenya 🇰🇪*


---

## 17. Delivery process & customer feedback (added)

**Needs the backend running** (orders live on the shop server so staff phones and customer phones see the same order).

### Customer
1. At checkout the customer chooses **Deliver to me** (location required) or **I'll pick it up at the shop** (shows the shop address, set in `SHOP_INFO` in `data.js`).
2. After paying, the receipt shows an **order code** (e.g. `LK-7H3K2`). If the shop server can't be reached, the receipt instead shows a **Send this order on WhatsApp** button, so an order is never lost.
3. **Track Order** tab: enter code + phone (or tap an order placed on this phone). Shows a timeline (Placed → Confirmed → Packing → Out for delivery / Ready for pickup → Delivered / Collected → Received), rider name, phone and ETA, and payment status.
4. When the order is delivered the customer taps **I have received my order**, then rates it: overall stars, delivery stars, were the items as expected, what went wrong (wrong item/size, damaged, late, poor quality, poor service), and a comment. One feedback per order.

### Staff
- **Deliveries** tab (attendants and manager): new orders, with a badge count. Each order card shows one next-step button (Confirm → Start packing → Send out for delivery / Ready for pickup → Mark delivered / collected), **Mark paid**, **WhatsApp customer** (message prefilled for the current stage) and **Cancel** (reason required).
- **Confirming** an order reduces stock once (the server stops a second phone from deducting it again). Stock lives on the device that confirmed it.
- Out for delivery asks for the rider's name, phone and ETA, which the customer then sees.
- Staff connect once with the **shop key** (`STAFF_KEY` on the server).
- **Feedback** tab (manager): average rating, delivery rating, % items as expected, most-reported problems, every comment, and a WhatsApp follow-up button for ratings of 3 or below.

### Safety
Names, comments and notes typed by customers are escaped before display. Tracking needs both the code and the phone number. Payment is only marked Paid automatically when the server itself saw the M-Pesa payment succeed.
