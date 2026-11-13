-- ═══════════════════════════════════════════════════════════
--  LOOKU STORE — Supabase (Postgres) schema
--  Paste this whole file into: Supabase → SQL Editor → New query → Run
--  Safe to run more than once.
-- ═══════════════════════════════════════════════════════════

create table if not exists orders (
  id                serial primary key,
  code              text    not null unique,
  customer_name     text    not null,
  customer_phone    text    not null,
  customer_location text,
  notes             text,
  fulfilment        text    not null default 'delivery' check (fulfilment in ('delivery','pickup')),
  items             jsonb   not null,
  total             numeric(12,2) not null,
  payment_method    text,
  payment_status    text    not null default 'Pending' check (payment_status in ('Pending','Paid','Failed')),
  payment_ref       text,
  mpesa_checkout_id text,
  status            text    not null default 'Placed'
                    check (status in ('Placed','Confirmed','Packing','OutForDelivery','ReadyForPickup','Delivered','Collected','Cancelled')),
  rider_name        text,
  rider_phone       text,
  eta_note          text,
  stock_deducted    boolean not null default false,
  received_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- one M-Pesa payment can only ever pay for one order
create unique index if not exists orders_mpesa_checkout_uidx on orders (mpesa_checkout_id) where mpesa_checkout_id is not null;
create index if not exists orders_phone_idx on orders (customer_phone);

create table if not exists order_events (
  id         serial primary key,
  order_id   integer not null references orders(id) on delete cascade,
  status     text    not null,
  note       text,
  by_name    text,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events (order_id, id);

create table if not exists feedback (
  id         serial primary key,
  order_id   integer not null unique references orders(id) on delete cascade,
  overall    smallint not null check (overall between 1 and 5),
  delivery   smallint check (delivery between 1 and 5),
  item_ok    boolean,
  issues     jsonb not null default '[]'::jsonb,
  comment    text,
  created_at timestamptz not null default now()
);

create table if not exists mpesa_transactions (
  id                   serial primary key,
  phone                text not null,
  amount               numeric(12,2) not null,
  account_reference    text,
  merchant_request_id  text,
  checkout_request_id  text unique,
  status               text not null default 'Pending' check (status in ('Pending','Success','Failed','Cancelled')),
  result_code          integer,
  result_desc          text,
  mpesa_receipt_number text,
  transaction_date     text,
  raw_callback         jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- used to stop abuse (too many orders / payment prompts / wrong keys)
create table if not exists rate_hits (
  key text        not null,
  at  timestamptz not null default now()
);
create index if not exists rate_hits_key_idx on rate_hits (key, at);

-- ═══════════ SHOP DATA (staff, products, in-shop sales…) ═══════════

create table if not exists staff (
  id            serial primary key,
  name          text    not null,
  username      text    not null unique,
  password_hash text    not null,
  role          text    not null check (role in ('manager','attendant')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- the database itself guarantees there is only ever ONE manager account
create unique index if not exists staff_one_manager_uidx on staff (role) where role = 'manager';

create table if not exists products (
  id          serial primary key,
  name        text    not null,
  brand       text,
  category    text    not null default 'General',
  unit        text,
  price       numeric(12,2) not null check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),     -- can never go negative
  description text,
  icon        text    default '📦',
  image_url   text,
  image_data  text,                                              -- uploaded photo (served via /api/products/:id/image)
  image_ver   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists sales (
  id                serial primary key,
  sale_date         date    not null default ((now() at time zone 'Africa/Nairobi')::date),
  attendant_id      integer,
  attendant_name    text,
  customer_name     text,
  customer_phone    text,
  customer_location text,
  customer_notes    text,
  payment_method    text    not null check (payment_method in ('Cash','Mobile Money','ATM/Card')),
  payment_status    text    not null default 'Paid' check (payment_status in ('Paid','Pending')),
  amount_paid       numeric(12,2),
  change_given      numeric(12,2),
  mobile_phone      text,
  network           text,
  pay_code          text,
  card_ref          text,
  items             jsonb   not null,
  total             numeric(12,2) not null,
  created_at        timestamptz not null default now()
);
create index if not exists sales_date_idx on sales (sale_date);
create index if not exists sales_paycode_idx on sales (pay_code);

create table if not exists delete_requests (
  id           serial primary key,
  product_id   integer,
  product_name text not null,
  requested_by text not null,
  reason       text not null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);

create table if not exists stock_reports (
  id         serial primary key,
  product_id integer,
  status     text not null default 'Submitted' check (status in ('Submitted','Reviewed')),
  data       jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key   text primary key,
  value text
);

-- ── LOCK THE TABLES ──────────────────────────────────────────
-- Supabase publishes your tables through a public web API. These lines make sure nobody can read or
-- change them that way. Only the Netlify function (using your private database password) can.
do $$
declare t text;
begin
  foreach t in array array['orders','order_events','feedback','mpesa_transactions','rate_hits',
                           'staff','products','sales','delete_requests','stock_reports','settings'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
