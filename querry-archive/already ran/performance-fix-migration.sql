-- ============================================================================
-- Brew Houze — One-time manual migration
-- Run this ONCE directly against your PostgreSQL database (e.g. via psql,
-- pgAdmin, or your hosting provider's SQL console).
--
-- WHY: These schema changes were previously being run automatically on
-- every API request (every product load, login, logout, void/refund, etc.).
-- Postgres still takes a brief lock for "IF NOT EXISTS" DDL even when
-- there is nothing to do, and doing this on every request under concurrent
-- use (multiple cashiers + admin dashboard + mobile customers) caused the
-- slow "data retrieving and updates after confirmations" you reported.
--
-- All statements below are idempotent (safe to run even if some/all of
-- them already exist in your database — nothing will be duplicated or
-- broken). After running this once, the app no longer performs any of
-- these schema changes at runtime.
-- ============================================================================

-- 1) Products: description column
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_description TEXT;

-- 2) Product variants: temperature support
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS temperature VARCHAR(20);

-- Drop old unique constraint on (product_id, size_label) if it exists,
-- so the new unique index (which also considers temperature) can be added.
ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_product_id_size_label_key;

-- Older DBs may have used this alternate legacy constraint name.
ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_product_id_variant_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_unique_idx
  ON product_variants (product_id, size_label, COALESCE(temperature, 'both'));

-- 3) Product categories table (+ default seed data)
CREATE TABLE IF NOT EXISTS product_categories (
  category_id SERIAL PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO product_categories (category_name)
SELECT seed.category_name
FROM unnest(ARRAY['Espresso Drinks', 'Cold Drinks']::text[]) AS seed(category_name)
WHERE NOT EXISTS (
  SELECT 1 FROM product_categories existing
  WHERE LOWER(existing.category_name) = LOWER(seed.category_name)
);

-- 4) Cashier permission flags
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS can_void_orders BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_refund_orders BOOLEAN NOT NULL DEFAULT FALSE;

-- 5) Employee attendance / time log table
CREATE TABLE IF NOT EXISTS employee_time_logs (
  time_log_id BIGSERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  time_in TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  time_out TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT employee_time_log_valid_range CHECK (time_out IS NULL OR time_out >= time_in)
);

CREATE INDEX IF NOT EXISTS employee_time_logs_admin_id_idx
  ON employee_time_logs (admin_id);

CREATE INDEX IF NOT EXISTS employee_time_logs_time_in_idx
  ON employee_time_logs (time_in DESC);

CREATE UNIQUE INDEX IF NOT EXISTS employee_one_open_time_log_idx
  ON employee_time_logs (admin_id) WHERE time_out IS NULL;

-- 6) Void/refund reversal tracking columns on sales_orders
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS reversed_by_admin_id INTEGER REFERENCES admin_users(admin_id),
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_type VARCHAR(20);

-- ============================================================================
-- Done. All of the above should already exist in your live database from
-- earlier work, so this migration is expected to be a safe no-op in most
-- cases — it's here purely so the schema is guaranteed correct after the
-- app code stopped creating/altering it automatically.
-- ============================================================================
