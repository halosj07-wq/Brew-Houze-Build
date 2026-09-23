-- One-time manual migration: adds an inventory change log so admin can export
-- a date-ranged inventory report (restocks, manual edits, order deductions,
-- void/refund restorations, item creation/deletion).
-- Run this once against the database. Safe to re-run (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS inventory_log (
  log_id BIGSERIAL PRIMARY KEY,
  inventory_id INTEGER REFERENCES inventory(inventory_id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  ingredient_category TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'created', 'restocked', 'manual_edit', 'order_deduction',
    'void_restore', 'refund_restore', 'deleted'
  )),
  quantity_before NUMERIC NOT NULL,
  quantity_after NUMERIC NOT NULL,
  quantity_delta NUMERIC NOT NULL,
  order_id INTEGER REFERENCES sales_orders(order_id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  source_app TEXT NOT NULL CHECK (source_app IN ('admin', 'cashier', 'mobile')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_log_created_at ON inventory_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_log_inventory_id ON inventory_log (inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_order_id ON inventory_log (order_id);
