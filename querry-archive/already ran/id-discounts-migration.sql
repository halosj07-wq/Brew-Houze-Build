-- ID discounts migration (senior citizen, PWD, student, employee meal and custom discounts)
--
-- Brew Houze is VAT-registered. Senior citizens (RA 9994) and persons with disability (RA 10754)
-- get 20 percent off and no VAT on the food and drinks they eat or drink themselves:
--   price without VAT = price / 1.12, then 20 percent off that.
-- Other discounts (student, employee meal, custom) come off the price as it is, VAT included.
--
-- 1. store_settings: shop-wide settings, one row each. For now VAT registration and the rate.
-- 2. discount_types: the discounts the admin offers, switched on and off in Admin, Discounts.
--    Senior and PWD are fixed by law (20 percent, VAT-exempt, ID required). Student and
--    employee meal come switched off. The admin can add custom discounts.
-- 3. order_discounts: one row per ID holder on an order. Name, ID number, what it covered, the
--    VAT taken off and the discount. This is the register kept for senior and PWD sales.
-- 4. sales_orders: vat_exempt_amount (VAT removed for senior and PWD items), and discount_source
--    accepts the new discount kinds. The total is subtotal minus discount minus VAT exempted.
-- 5. payment_checkouts: id_discounts keeps the ID discounts of a GCash payment until it is paid.
-- 6. counter_carts: mobile carts sent to the counter for an ID discount (used by the next update).
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS store_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO store_settings (setting_key, setting_value) VALUES ('vat_registered', 'true') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO store_settings (setting_key, setting_value) VALUES ('vat_rate', '12') ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS discount_types (
  discount_type_id SERIAL PRIMARY KEY,
  code TEXT NOT NULL CHECK (code IN ('senior', 'pwd', 'student', 'employee', 'custom')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  discount_kind TEXT NOT NULL CHECK (discount_kind IN ('percent', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  max_discount NUMERIC(10, 2) CHECK (max_discount IS NULL OR max_discount > 0),
  vat_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  requires_id BOOLEAN NOT NULL DEFAULT TRUE,
  id_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (discount_kind <> 'percent' OR discount_value <= 100)
);
-- One of each built-in discount. Custom discounts can be added freely.
CREATE UNIQUE INDEX IF NOT EXISTS discount_types_builtin_code ON discount_types (code) WHERE code <> 'custom';
INSERT INTO discount_types (code, name, discount_kind, discount_value, vat_exempt, requires_id, id_label, is_active, sort_order)
VALUES ('senior', 'Senior Citizen', 'percent', 20, TRUE, TRUE, 'OSCA or senior citizen ID no.', TRUE, 1)
ON CONFLICT (code) WHERE code <> 'custom' DO NOTHING;
INSERT INTO discount_types (code, name, discount_kind, discount_value, vat_exempt, requires_id, id_label, is_active, sort_order)
VALUES ('pwd', 'PWD', 'percent', 20, TRUE, TRUE, 'PWD ID no.', TRUE, 2)
ON CONFLICT (code) WHERE code <> 'custom' DO NOTHING;
INSERT INTO discount_types (code, name, discount_kind, discount_value, vat_exempt, requires_id, id_label, is_active, sort_order)
VALUES ('student', 'Student', 'percent', 10, FALSE, TRUE, 'Student ID no.', FALSE, 3)
ON CONFLICT (code) WHERE code <> 'custom' DO NOTHING;
INSERT INTO discount_types (code, name, discount_kind, discount_value, vat_exempt, requires_id, id_label, is_active, sort_order)
VALUES ('employee', 'Employee meal', 'percent', 20, FALSE, FALSE, NULL, FALSE, 4)
ON CONFLICT (code) WHERE code <> 'custom' DO NOTHING;

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS vat_exempt_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (vat_exempt_amount >= 0);
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_discount_source_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_discount_source_check
  CHECK (discount_source IS NULL OR discount_source IN ('reward', 'birthday', 'pwd', 'senior', 'promo', 'student', 'employee', 'custom', 'mixed'));

CREATE TABLE IF NOT EXISTS order_discounts (
  order_discount_id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES sales_orders(order_id) ON DELETE CASCADE,
  discount_type_id INTEGER REFERENCES discount_types(discount_type_id) ON DELETE SET NULL,
  type_code TEXT NOT NULL,
  type_name TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  id_number TEXT,
  -- items: the holder picked their own items. shared: a shared bill split by group_size.
  coverage TEXT NOT NULL CHECK (coverage IN ('items', 'shared')),
  group_size INTEGER CHECK (group_size IS NULL OR group_size BETWEEN 1 AND 50),
  covered_items JSONB,
  covered_amount NUMERIC(10, 2) NOT NULL CHECK (covered_amount >= 0),
  vat_exempt_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (vat_exempt_amount >= 0),
  discount_amount NUMERIC(10, 2) NOT NULL CHECK (discount_amount >= 0),
  recorded_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_discounts_order ON order_discounts (order_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_created ON order_discounts (created_at);
CREATE INDEX IF NOT EXISTS idx_order_discounts_id_number ON order_discounts (type_code, lower(id_number));

ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS id_discounts JSONB;

CREATE TABLE IF NOT EXISTS counter_carts (
  counter_cart_id SERIAL PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL,
  items JSONB NOT NULL,
  customer_id INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
  discount_type_id INTEGER REFERENCES discount_types(discount_type_id) ON DELETE SET NULL,
  service_type TEXT CHECK (service_type IS NULL OR service_type IN ('dine_in', 'take_out')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ordered', 'cancelled', 'expired')),
  order_id INTEGER REFERENCES sales_orders(order_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_counter_carts_status ON counter_carts (status, created_at);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_carts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_settings FROM anon, authenticated;
REVOKE ALL ON discount_types FROM anon, authenticated;
REVOKE ALL ON order_discounts FROM anon, authenticated;
REVOKE ALL ON counter_carts FROM anon, authenticated;
