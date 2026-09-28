-- Delivery setup migration (phase 2 of delivery)
--
-- 1. delivery_zones: the areas the cafe delivers to, each with its fee and an optional minimum
--    order, set in Admin, Delivery. A zone can be switched off without deleting it.
-- 2. customers: a mobile number (09XXXXXXXXX), and a COD block the admin sets (or the system
--    sets after a failed cash on delivery order) with the reason.
-- 3. customer_addresses: each customer address book. Every address belongs to a zone, and has
--    the recipient and their mobile number for the rider.
-- 4. store_settings: the delivery rules. Delivery starts switched off.
--      delivery_enabled        true or false
--      delivery_start / _end   HH:MM, empty means whenever a shift is open
--      delivery_max_active     how many deliveries can be in progress at once, empty for no limit
--      delivery_free_above     free delivery for orders at or above this amount, empty for never
--      cod_enabled             cash on delivery allowed (signed-in customers only)
--      cod_max_amount          the largest order that can be paid on delivery
--      cod_min_orders          completed orders a customer needs before cash on delivery
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS delivery_zones (
  zone_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description TEXT,
  fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  min_order NUMERIC(10, 2) CHECK (min_order IS NULL OR min_order > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_format;
ALTER TABLE customers ADD CONSTRAINT customers_phone_format CHECK (phone IS NULL OR phone ~ '^09[0-9]{9}$');
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cod_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cod_block_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_addresses (
  address_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home' CHECK (length(label) BETWEEN 1 AND 30),
  recipient_name TEXT NOT NULL CHECK (length(recipient_name) BETWEEN 2 AND 80),
  phone TEXT NOT NULL CHECK (phone ~ '^09[0-9]{9}$'),
  zone_id INTEGER REFERENCES delivery_zones(zone_id) ON DELETE SET NULL,
  street TEXT NOT NULL CHECK (length(street) BETWEEN 3 AND 200),
  landmark TEXT,
  rider_notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses (customer_id);

INSERT INTO store_settings (setting_key, setting_value) VALUES ('delivery_enabled', 'false') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('delivery_start', '') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('delivery_end', '') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('delivery_max_active', '') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('delivery_free_above', '') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('cod_enabled', 'false') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('cod_max_amount', '1000') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('cod_min_orders', '1') ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON delivery_zones FROM anon, authenticated;
REVOKE ALL ON customer_addresses FROM anon, authenticated;
