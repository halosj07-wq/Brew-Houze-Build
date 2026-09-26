-- Archiving migration
-- Purpose: replace permanent DELETE operations with soft-archiving across the system.
-- Nothing gets physically removed from the database anymore when a user "deletes" a
-- product, inventory item, addition, sales record, or clears employee time logs -- the
-- row is instead flagged as archived and hidden from normal views, and can be restored
-- from the new Archives section in the admin app.
--
-- Run this once against the production database before deploying the updated app code.

-- Products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_archived ON products (is_archived);

-- Product variants (a single size/temperature of a product can be archived on its own)
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_is_archived ON product_variants (is_archived);

-- Inventory
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_is_archived ON inventory (is_archived);

-- Additions (already has is_active; that flag now doubles as "not archived".
-- We only need to add timestamp/actor tracking for when it was archived.)
ALTER TABLE additions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;

-- Sales orders (covers both single-record deletes and the "Clear all finance records" action)
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_is_archived ON sales_orders (is_archived);

-- Employee time logs (covers the "Clear employee logs" action)
ALTER TABLE employee_time_logs
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_time_logs_is_archived ON employee_time_logs (is_archived);
