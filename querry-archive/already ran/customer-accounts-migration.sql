-- Customer accounts migration (loyalty Phase 1)
--
-- Customers of the mobile menu can make an account, and the admin keeps a customer directory:
--   customers                    one row per customer. A row without a username is a profile the
--                                admin made (no login yet). notes are admin-only, for example
--                                wants their hot drinks with a straw.
--   customer_sessions            signed-in phones. The cookie carries a random id, only its
--                                SHA-256 hash is stored.
--   customer_password_resets     single-use reset links for customers who gave an email.
--   customer_login_failures      wrong passwords, to slow down password guessing.
--   sales_orders.customer_id     the customer an order belongs to (purchases fill in by themselves)
--   payment_checkouts.customer_id  kept until a GCash payment becomes an order
--
-- A deleted account is not removed: its personal details are erased (deleted_at is set) so the
-- sales records that point to it stay complete, as the Data Privacy Act allows.
--
-- Run in the Supabase SQL editor before deploying the matching mobile, staff and admin code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS customers (
  customer_id SERIAL PRIMARY KEY,
  username VARCHAR(30),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254),
  password_hash TEXT,
  birthday DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  consented_at TIMESTAMPTZ,
  consent_version TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Usernames and emails are unique regardless of letter case.
CREATE UNIQUE INDEX IF NOT EXISTS customers_username_key ON customers (LOWER(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_key ON customers (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_sessions (
  session_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('signed_out', 'password_reset', 'password_changed', 'signed_out_by_admin', 'account_deleted', 'deactivated'))
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_active ON customer_sessions (customer_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_password_resets (
  reset_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_password_resets_customer ON customer_password_resets (customer_id, created_at);

CREATE TABLE IF NOT EXISTS customer_login_failures (
  failure_id SERIAL PRIMARY KEY,
  username_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_login_failures_key ON customer_login_failures (username_key, created_at);

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders (customer_id, created_at) WHERE customer_id IS NOT NULL;

ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL;

-- Keeps the new tables out of the Supabase Data API. The apps connect as the owner and are not affected.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_login_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customers FROM anon, authenticated;
REVOKE ALL ON customer_sessions FROM anon, authenticated;
REVOKE ALL ON customer_password_resets FROM anon, authenticated;
REVOKE ALL ON customer_login_failures FROM anon, authenticated;
