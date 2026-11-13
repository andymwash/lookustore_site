# Looku Store — put it online with Netlify + Supabase

**What goes where**
- **Netlify** hosts the website (`public/`) and the server code (one function, `netlify/functions/api.js`).
- **Supabase** is the database (Postgres). It holds **everything**: products and stock, in-shop sales, online orders,
  delivery tracking, customer feedback, M-Pesa payments, and the staff and manager logins.

Because everything lives in the database, every phone and computer sees the same stock, sales and orders.

> ⚠️ **This needs the internet.** Recording a sale, receiving stock, and logging in all talk to the database, so a staff
> phone with no connection can't do them until it is back online. (Browsing the already-open page still works.)

---

## Part A — Supabase (about 10 minutes)

1. **supabase.com** → sign up → **New project**.
   - Name: `looku-store`
   - **Database password:** make one up using **letters and numbers only** (no `@ # / : ?`) and save it somewhere safe.
   - Region: the closest to Kenya that is offered.
2. Wait until the project is ready.
3. **SQL Editor → New query**. Open `supabase/schema.sql`, copy everything, paste, click **Run**. You should see "Success". (Running it twice is harmless.)
4. Click the green **Connect** button at the top.
   - Choose **Transaction pooler** (port **6543**). **Not** "Direct connection": on the free plan it is IPv6-only and Netlify can't reach it.
   - Copy the URI, replace `[YOUR-PASSWORD]` with your database password (delete the square brackets too).
   - That whole line is your **DATABASE_URL**. Treat it like a bank PIN: never put it in the website files or send it in a chat.

## Part B — Put the files on GitHub

Netlify builds the server code from a Git repository (plain drag-and-drop does not install the packages the function needs).

1. Create a free account at **github.com** and install **GitHub Desktop**.
2. GitHub Desktop → **File → Add local repository** → choose this folder (`looku-store-netlify`). If it says it isn't a repository, click **create a repository**.
3. **Commit** everything, then **Publish repository** (keep it **Private**). The `.gitignore` already keeps `.env` and `node_modules` out.

## Part C — Netlify

1. **netlify.com** → sign up → **Add new site → Import an existing project → GitHub** → pick the repository.
2. Settings are read from `netlify.toml`. Leave them as shown.
3. Before deploying, open **Site configuration → Environment variables** and add these three:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Transaction pooler line from Part A |
| `JWT_SECRET` | a long random string (32+ characters). Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, or any password generator set to 40+ characters |
| `SETUP_KEY` | a key only you know (8+ characters). It is used **once**, to create the manager account |

4. **Deploy**. When it finishes, open `https://YOUR-SITE.netlify.app/api/health`. You should see:
   `"database":true`, `"jwtSecretSet":true`, `"setupKeySet":true`, `"needsSetup":true`.
   (`"mpesaConfigured":false` is expected until you add M-Pesa details.)

## Part D — First-time setup on the website

1. Open the website → **Manager** → because no manager exists yet, you land on **Set up your shop**.
2. Enter the **setup key** (your `SETUP_KEY`), your name, a username and a password (8+ characters). This creates the manager account and logs you in.
   This page never appears again. There is only ever one manager account.
3. **Moving your existing data (only if you used the earlier version on the shop computer/phone):** on that same device,
   the manager's Overview shows a banner **"Found shop data saved on this device"**. Click **Import it now**. It brings across
   your products and stock, past sales and staff logins, once. (If product pictures are too big they are skipped and you can upload them again.)
   Do this on the device that holds your real data; do not import test data.
4. **Attendants** tab → add each attendant (name, username, password of 8+ characters). Imported attendants keep their old passwords,
   so ask them to be changed with **Reset password**.
5. **Stock** tab → add or check your products and their quantities.

## Part E — Test it before real customers

1. On a phone, open the site as a customer and place an order. Note the order code.
2. On an attendant's phone: log in → **Deliveries** → Confirm → Pack → Send out → Mark delivered. Stock goes down when you **Confirm**.
3. On the customer phone: **Track Order** → **I have received my order** → leave feedback. The manager sees it under **Feedback**.
4. Record an in-shop sale on two attendants' phones at the same time for the last item in stock: only one succeeds, the other is told there isn't enough.
5. Remove the test orders: Supabase → SQL Editor → run `delete from orders;`

## Part F — Real M-Pesa prompts (later, optional)

Only possible once you have your **own Paybill or Till number** from Safaricom. Add these Netlify environment variables and redeploy:

| Name | Value |
|---|---|
| `MPESA_ENVIRONMENT` | `sandbox` while testing, `production` when live |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` | from developer.safaricom.co.ke |
| `MPESA_SHORTCODE`, `MPESA_PASSKEY` | from Safaricom |
| `MPESA_CALLBACK_URL` | `https://YOUR-SITE.netlify.app/api/mpesa/callback` |
| `MPESA_TRANSACTION_TYPE` | Paybill: leave out. Till number: `CustomerBuyGoodsOnline` |
| `MPESA_PARTY_B` | Till numbers only: the Till number |

Until then, checkout uses manual payment (pay to Equity, enter the SMS code) automatically.

## Part G — Your own address
Netlify → **Domain management → Add a domain** (for example `lookustore.co.ke`) and follow its DNS instructions.

---

## What changed compared with the earlier version
- **Logins are real now.** Passwords are stored scrambled in the database (never in the website's code). The old built-in
  `manager / looku2026` login and the attendant passwords inside the code are gone. Staff sessions last 12 hours or until Logout.
- **Prices come from your product list.** Online customers can't change a price; the server uses yours.
- **Stock is exact.** Selling, receiving stock and confirming an online order each change stock in one step, so two phones
  can never sell the same last item. Stock can't go below zero. Cancelling a confirmed online order puts the items back.
- **Online orders appear in the manager's Overview and Finance** together with shop sales, and in Sales marked as online
  (they are cancelled/managed from the **Deliveries** tab, not deleted from Sales).
- The **"Reset all data"** button was removed. It can't safely exist when the data is shared.
- Success messages now appear as a pop-up at the top of the screen (before, the next screen refresh could wipe them).
- The in-app notification bell is still local to each phone. Use the **Deliveries** badge, **Pending payments** and **Requests** counts for alerts.

## Keeping it safe
- `DATABASE_URL` and `JWT_SECRET` give powerful access. Only ever put them in Netlify's environment variables.
- Every table has Supabase's row-level security switched on, so the public Supabase web API can't read your data. Don't switch it off.
- If an attendant leaves: Manager → Attendants → **Remove**. Their phone is logged out on its next action.
- If you suspect `JWT_SECRET` leaked: change it in Netlify and redeploy. Everyone is logged out and must sign in again.

## If something is wrong
| You see | Likely cause |
|---|---|
| `/api/health` shows `"database":false` | Wrong `DATABASE_URL` (password still in `[ ]`, wrong password, or "Direct connection" copied instead of "Transaction pooler"). Netlify → Functions → api → logs shows the reason. |
| `/api/health` is a 404 page | The `netlify.toml` redirect isn't active: the file must be at the top level of the repository. Redeploy. |
| Login says "server is not fully set up" | `JWT_SECRET` is missing, too short (under 32 characters) or still a placeholder. |
| Setup page says "Setup is not switched on" | `SETUP_KEY` is missing or shorter than 8 characters. |
| Setup page says a manager already exists | Setup was already done. Log in instead. |
| "Session has ended" | You logged in more than 12 hours ago, or your account was removed. Log in again. |
| "Can't reach the shop server" | No internet on that device, or the Netlify site is down. |
| Site shows old screens after an update | Hard-refresh (Ctrl+Shift+R). The site keeps an offline copy of itself. |
| Supabase project paused | Free Supabase projects can pause after a period of no activity (I believe about a week). Open the project in Supabase and click Restore. Check Supabase's current plan terms. |
