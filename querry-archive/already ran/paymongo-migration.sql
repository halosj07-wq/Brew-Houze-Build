-- PayMongo GCash migration
--
-- GCash payments through PayMongo. A checkout row is created when a customer starts paying,
-- and the sales order is only created once PayMongo reports the payment as paid. Abandoned
-- payments therefore never touch stock or queue numbers.
--
-- Sales orders also record which provider took the payment and its PayMongo payment id, so a
-- refund can be matched to the right payment.
--
-- Run in the Supabase SQL editor before deploying the matching cashier and mobile app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS payment_checkouts (
  checkout_id SERIAL PRIMARY KEY,
  source_app TEXT NOT NULL CHECK (source_app IN ('cashier', 'mobile')),
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'completed', 'failed', 'cancelled', 'refunded', 'needs_attention')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  items JSONB NOT NULL,
  cashier_admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  public_token UUID NOT NULL UNIQUE,
  intent_id TEXT UNIQUE,
  payment_id TEXT,
  order_id INTEGER REFERENCES sales_orders(order_id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_checkouts_status ON payment_checkouts (status, created_at DESC);

-- Keeps the table out of the Supabase Data API. The apps connect as the owner and are not affected.
ALTER TABLE payment_checkouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;
