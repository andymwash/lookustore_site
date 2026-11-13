# LOOKU STORE — Backend API
### Node.js + Express + SQLite · Eldoret, Kenya 🇰🇪

---

## 📁 Project Structure

```
looku-store-backend/
├── server.js                  ← Main entry point
├── package.json
├── .env.example               ← Copy to .env and configure
├── looku_store.db             ← SQLite database (auto-created)
├── uploads/                   ← Product images stored here
├── config/
│   ├── database.js            ← DB init & connection
│   └── seed.js                ← Default users & products
├── middleware/
│   └── auth.js                ← JWT authentication guard
└── routes/
    ├── auth.js                ← Login / logout
    ├── products.js            ← Product CRUD + image upload
    ├── sales.js               ← Sales recording & reporting
    ├── users.js               ← Attendant management
    ├── notifications.js       ← In-app notifications
    ├── deleteRequests.js      ← Attendant delete requests
    └── reports.js             ← CSV downloads & finance
```

---

## 🚀 Setup & Run

### 1. Install Node.js (v22+)
Download from https://nodejs.org — version 22 or higher is required.

### 2. Install dependencies
```bash
cd looku-store-backend
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` if needed (defaults work out of the box).

### 4. Start the server
```bash
# Production
node --experimental-sqlite server.js

# Development (auto-restart on changes)
npm run dev
```

### 5. Open the app
- **API:**      http://localhost:3000/api/health
- **Frontend:** http://localhost:3000  (if looku-store folder is alongside)

---

## 🔑 Default Login Credentials

| Role      | Username   | Password      |
|-----------|------------|---------------|
| Manager   | `manager`  | `looku2026`   |
| Attendant | `wanjiru`  | `wanjiru123`  |
| Attendant | `kipchoge` | `kipchoge123` |
| Attendant | `achieng`  | `achieng123`  |

---

## 📡 API Endpoints

All protected routes require: `Authorization: Bearer <token>`

### 🔐 Auth
| Method | Endpoint           | Access  | Description        |
|--------|--------------------|---------|--------------------|
| POST   | `/api/auth/login`  | Public  | Login, get token   |
| GET    | `/api/auth/me`     | Any     | Current user info  |
| POST   | `/api/auth/logout` | Any     | Logout             |

**Login example:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"manager","password":"looku2026"}'
```

---

### 📦 Products
| Method | Endpoint                        | Access           | Description          |
|--------|---------------------------------|------------------|----------------------|
| GET    | `/api/products`                 | Public           | All products         |
| GET    | `/api/products?category=X`      | Public           | Filter by category   |
| GET    | `/api/products?search=dress`    | Public           | Search products      |
| GET    | `/api/products/categories`      | Public           | All categories       |
| GET    | `/api/products/:id`             | Public           | Single product       |
| POST   | `/api/products`                 | Manager          | Add product          |
| PUT    | `/api/products/:id`             | Manager          | Edit product         |
| DELETE | `/api/products/:id`             | Manager          | Delete product       |
| POST   | `/api/products/:id/stock`       | Manager/Attendant| Update stock qty     |

**Add product with image (base64):**
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kitenge Dress",
    "brand": "Looku Ankara",
    "category": "Women'\''s Wear",
    "unit": "Sizes S/M/L/XL",
    "price": 2500,
    "stock": 15,
    "description": "Beautiful Ankara kitenge dress",
    "imageBase64": "data:image/jpeg;base64,..."
  }'
```

---

### 💰 Sales
| Method | Endpoint                      | Access           | Description         |
|--------|-------------------------------|------------------|---------------------|
| GET    | `/api/sales`                  | Manager/Attendant| All sales           |
| GET    | `/api/sales?method=M-Pesa`    | Manager/Attendant| Filter by method    |
| GET    | `/api/sales/summary`          | Manager          | Revenue summary     |
| GET    | `/api/sales/:id`              | Manager/Attendant| Single sale         |
| POST   | `/api/sales`                  | Any (auth)       | Record new sale     |
| PATCH  | `/api/sales/:id/status`       | Manager/Attendant| Update payment status|
| DELETE | `/api/sales/:id`              | Manager          | Delete sale         |

**Record a sale:**
```bash
curl -X POST http://localhost:3000/api/sales \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"productId": 1, "qty": 2, "unitPrice": 2800},
      {"productId": 13, "qty": 1}
    ],
    "customerName": "Amina Hassan",
    "customerPhone": "0712345678",
    "customerLocation": "PCEA Area, Eldoret",
    "paymentMethod": "M-Pesa",
    "mobilePhone": "0712345678",
    "network": "M-Pesa (Safaricom)"
  }'
```

---

### 👥 Users
| Method | Endpoint                       | Access  | Description        |
|--------|--------------------------------|---------|--------------------|
| GET    | `/api/users`                   | Manager | All users          |
| POST   | `/api/users`                   | Manager | Create attendant   |
| PUT    | `/api/users/:id`               | Manager | Edit user          |
| DELETE | `/api/users/:id`               | Manager | Remove user        |
| PATCH  | `/api/users/:id/password`      | Manager/Self| Change password|

---

### 📊 Reports
| Method | Endpoint                      | Access  | Description           |
|--------|-------------------------------|---------|----------------------|
| GET    | `/api/reports/sales-csv`      | Manager | Download sales CSV   |
| GET    | `/api/reports/restock-csv`    | Manager | Download restock CSV |
| GET    | `/api/reports/finance`        | Manager | Finance JSON summary |

---

### 🔔 Notifications
| Method | Endpoint                       | Access | Description         |
|--------|--------------------------------|--------|---------------------|
| GET    | `/api/notifications`           | Any    | Get notifications   |
| GET    | `/api/notifications?role=manager` | Any | Filter by role   |
| PATCH  | `/api/notifications/read`      | Any    | Mark all as read    |
| DELETE | `/api/notifications`           | Any    | Clear notifications |

---

### 🗑 Delete Requests
| Method | Endpoint                       | Access    | Description          |
|--------|--------------------------------|-----------|----------------------|
| GET    | `/api/delete-requests`         | Manager   | All pending requests |
| POST   | `/api/delete-requests`         | Attendant | Submit request       |
| PATCH  | `/api/delete-requests/:id`     | Manager   | Approve or reject    |

---

## 🗄️ Database Tables

| Table             | Purpose                              |
|-------------------|--------------------------------------|
| `users`           | Managers and attendants              |
| `products`        | Clothing items with images           |
| `sales`           | Transaction records                  |
| `sale_items`      | Individual items per sale            |
| `delete_requests` | Attendant product deletion requests  |
| `notifications`   | In-app notifications per role        |

---

## 🔒 Security Notes
- Passwords are **bcrypt hashed** (never stored in plain text)
- All protected routes use **JWT tokens** (24hr expiry)
- Role-based access: Manager sees everything; Attendants see their own data
- In production, set `NODE_ENV=production` and restrict CORS origin

## 🌍 Deployment (Render.com — Free)
1. Push to GitHub
2. Go to https://render.com → New Web Service
3. Connect your repo
4. Build command: `npm install`
5. Start command: `node --experimental-sqlite server.js`
6. Add environment variables from `.env`

---

## 📲 M-Pesa Daraja API Integration

Looku Store can send **real M-Pesa STK Push** payment prompts to customers' phones
instead of the simulated message. This is handled by `services/mpesa.js` and
`routes/mpesa.js`.

### Step 1 — Get Credentials from Safaricom

1. Register at **https://developer.safaricom.co.ke/** (company or individual account)
2. Log in → **My Apps** → **Create a new App**
3. Select the **M-Pesa Express (STK Push)** API for your app
4. Copy your **Consumer Key** and **Consumer Secret** from the app page
5. Go to the **M-Pesa Express → Simulator** page — copy the sandbox **Shortcode**
   (Party B) and **Passkey** shown there

> Sandbox uses fake money and the test number `254708374149`. No real transactions
> happen until you switch to production.

### Step 2 — Set Up a Public Callback URL

Safaricom needs to **call your server** to tell you whether the payment succeeded.
Your server must be reachable over **public HTTPS** — `localhost` will not work.

**For local development**, use [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# Copy the https://xxxx.ngrok-free.app URL it gives you
```

**For production**, use your real deployed domain, e.g.
`https://api.lookustore.co.ke/api/mpesa/callback`

### Step 3 — Configure `.env`

```bash
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_CALLBACK_URL=https://your-ngrok-or-domain.com/api/mpesa/callback
```

> The sandbox `MPESA_SHORTCODE` and `MPESA_PASSKEY` above are Safaricom's public test
> values — safe to use as-is for sandbox testing. **Never commit your real Consumer Key,
> Consumer Secret, or production Passkey to source control.**

### Step 4 — Test in Sandbox

```bash
node --experimental-sqlite server.js
```

```bash
curl -X POST http://localhost:3000/api/mpesa/stk-push \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "254708374149",
    "amount": 10,
    "saleId": 1
  }'
```

You should get back:
```json
{
  "success": true,
  "message": "Success. Request accepted for processing",
  "checkoutRequestId": "ws_CO_...",
  "merchantRequestId": "..."
}
```

In **sandbox**, no real prompt appears on a phone — instead, use the Safaricom
[Simulator page](https://developer.safaricom.co.ke/test_credentials) to manually
simulate a successful or failed payment, which will trigger your callback.

### Step 5 — Watch the Callback Land

Check your server logs — you should see:
```
📲 M-Pesa callback received: {...}
✅ M-Pesa payment confirmed: NLJ7RT61SV (KSH 10)
```

Check the transaction status:
```bash
curl http://localhost:3000/api/mpesa/status/ws_CO_... \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Step 6 — Go Live (Production)

1. Apply for a **Paybill** or **Till Number** through Safaricom (requires a
   registered business — you cannot use a personal M-Pesa line)
2. Once approved, Safaricom gives you **production** Consumer Key, Consumer Secret,
   Shortcode, and Passkey
3. Update `.env`:
   ```bash
   MPESA_ENVIRONMENT=production
   MPESA_CONSUMER_KEY=<production_key>
   MPESA_CONSUMER_SECRET=<production_secret>
   MPESA_SHORTCODE=<your_real_paybill_or_till>
   MPESA_PASSKEY=<production_passkey>
   MPESA_CALLBACK_URL=https://api.lookustore.co.ke/api/mpesa/callback
   ```
4. **No code changes needed** — `services/mpesa.js` automatically switches the base
   URL between sandbox and production based on `MPESA_ENVIRONMENT`

### How It Works — Request Flow

```
Customer checks out → Frontend calls POST /api/mpesa/stk-push
                              │
                              ▼
                    Backend gets OAuth token from Daraja
                              │
                              ▼
                    Backend sends STK Push request
                              │
                              ▼
              Customer's phone shows M-Pesa PIN prompt
                              │
                  (customer enters PIN, ~5-60 seconds)
                              │
                              ▼
        Safaricom calls POST /api/mpesa/callback on YOUR server
                              │
                              ▼
         Backend marks transaction Success/Failed in DB,
         updates the linked sale's payment_status,
         and notifies the Manager + Customer
```

### Endpoints Added

| Method | Endpoint | Access | Description |
|--------|----------|--------|--------------|
| POST | `/api/mpesa/stk-push` | Authenticated | Initiate a payment prompt |
| POST | `/api/mpesa/callback` | **Public, no auth** | Safaricom's result webhook |
| GET  | `/api/mpesa/status/:checkoutId` | Authenticated | Check payment status |

> ⚠️ `/api/mpesa/callback` **must stay public** — Safaricom cannot send your JWT
> token. Do not add `authenticate` middleware to this route.

### Database Table Added

`mpesa_transactions` — tracks every STK Push sent and its eventual outcome
(`Pending` → `Success` / `Failed` / `Cancelled`), including the M-Pesa receipt
number once payment succeeds.

### Common Errors

| Error | Cause |
|---|---|
| `MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not set` | `.env` not configured |
| `Invalid phone number` | Phone isn't a valid Kenyan number (07XX / 01XX / 254XXX) |
| `MPESA_CALLBACK_URL is not set` | Safaricom needs a public HTTPS URL to call back |
| Daraja auth failed (400) | Wrong Consumer Key/Secret, or sandbox/production mismatch |
| Callback never arrives | Callback URL isn't publicly reachable (check ngrok is running) |

---

## 🔔 Automatic payment prompt at checkout (customers)

Customers get an M-Pesa prompt on their phone automatically. If the payment server is
unreachable, switched off, or the prompt can't be sent / isn't confirmed within ~75 seconds,
the checkout falls back to manual payment (Equity details + confirmation code).

**To switch it on**
1. Host this backend on a public HTTPS address and fill in `.env` (see `.env.example`).
2. In the website's `index.html`, set `window.LOOKU_API_BASE = "https://your-backend-address"`.
3. `GET /api/mpesa/pay/available` should return `{"enabled":true}`.

**Public endpoints (rate-limited: 3 prompts / phone / 10 min, 10 / IP / 10 min)**
| Method | Endpoint | Purpose |
|---|---|---|
| GET  | `/api/mpesa/pay/available` | Is automatic payment on? |
| POST | `/api/mpesa/pay/stk` | `{ phone, amount }` → sends the prompt |
| GET  | `/api/mpesa/pay/status/:id` | Poll result (asks Safaricom directly if the callback is late) |
| POST | `/api/mpesa/callback` | Safaricom's webhook — verified with Safaricom before marking paid |
| GET  | `/api/mpesa/transactions` | Manager only: recent payments (receipt, phone, amount, status) |

**Important:** direct M-Pesa prompts (Daraja) need your *own* Paybill or Till number. A bank
account number alone is not enough. Till numbers: set `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline`
and `MPESA_PARTY_B=<till number>`.

---

## 🚚 Online orders, delivery tracking & customer feedback

Customers place an order → the shop sees it → staff move it through the stages → the customer
tracks it with their **order code + phone number**, confirms they received it, and rates it.

**Stages:** delivery `Placed → Confirmed → Packing → OutForDelivery → Delivered` ·
pickup `Placed → Confirmed → Packing → ReadyForPickup → Collected` · `Cancelled` (needs a reason,
not possible once out for delivery). Stages can only move forward one step at a time.

**Switch it on:** set `STAFF_KEY` in `.env` (8+ random characters). Staff enter it once on the shop
phone/computer (Deliveries tab). If `STAFF_KEY` is empty the staff desk stays OFF (fails closed).

| Who | Method | Endpoint | Purpose |
|---|---|---|---|
| Customer | POST | `/api/orders` | Place order (total is recomputed by the server; payment only counts as Paid if the server saw the M-Pesa payment succeed) |
| Customer | GET | `/api/orders/track?code=&phone=` | Timeline, rider, ETA (code AND phone must match) |
| Customer | POST | `/api/orders/received` | "I have received my order" |
| Customer | POST | `/api/orders/feedback` | 1–5 stars, delivery stars, items OK?, issues, comment (once per order, only after delivery) |
| Staff | GET | `/api/orders/admin/list` | All orders |
| Staff | PATCH | `/api/orders/admin/:id/status` | Move to next stage (rider name required for "out for delivery") |
| Staff | PATCH | `/api/orders/admin/:id/payment` | Mark Paid / Pending / Failed |
| Staff | POST | `/api/orders/admin/:id/stock-deducted` | One-time claim so stock is reduced only once per order |
| Staff | GET | `/api/orders/admin/feedback` | Feedback list + averages (manager screen) |

Staff requests send the key in the `X-Shop-Key` header. 10 wrong keys from one address locks it out
for 10 minutes. Public endpoints are rate-limited (orders: 6 per phone per 10 min).

**Tables added:** `orders`, `order_events` (the timeline), `feedback`.
