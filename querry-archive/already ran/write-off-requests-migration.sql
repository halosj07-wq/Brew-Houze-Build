-- Write-off requests migration (staff report waste, an admin approves)
--
-- Only admins write stock off. Staff see the waste first (a dropped drink, milk past its date), so
-- they report it from the staff app and an admin approves or rejects the report:
--
-- 1. write_off_requests: one report each. What was wasted is either a menu item (a size of a
--    product, for example 1 Cafe Latte 16 oz spilled, which counts all its recipe ingredients) or
--    one inventory item (for example 1 liter of milk expired), with how many, the reason
--    (expired, damaged, wasted, in_house or other), a note, who reported it and in which shift.
--      pending -> approved   an admin wrote the stock off (approved_cost is what it was worth)
--      pending -> rejected   an admin turned it down (decision_note says why)
--      pending -> cancelled  the staff member took it back before a decision
--
-- 2. inventory_log.write_off_request_id: the stock history entries an approval made point back
--    to the report.
--
-- 3. Voids and refunds of orders that were already made. Until now every void and refund put the
--    ingredients back in stock, even when the drink was made and poured away. Now the cashier
--    says whether it was made:
--      not made   the stock comes back, as before
--      made       the stock does not come back (it is gone), and the order cost is counted as
--                 stock written off on the day of the void or refund
--    sales_orders.reversed_after_made: true when it was made (null for orders reversed before).
--    sales_orders.wasted_cost: what the made items cost, from the cost saved with the order
--    when it was sold (null when an item had no cost).
--
-- Run in the Supabase SQL editor before deploying the matching cashier and admin app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS write_off_requests (
  request_id SERIAL PRIMARY KEY,
  product_variant_id INTEGER REFERENCES product_variants(product_variant_id),
  inventory_id INTEGER REFERENCES inventory(inventory_id),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  -- What was wasted as the staff saw it, for example Cafe Latte 16 oz or Fresh Milk (liters).
  label TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('expired', 'damaged', 'wasted', 'in_house', 'other')),
  note TEXT,
  requested_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  shift_id INTEGER REFERENCES shifts(shift_id),
  source_app TEXT NOT NULL DEFAULT 'cashier' CHECK (source_app IN ('cashier', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  approved_cost NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A menu item or an inventory item, never both.
  CONSTRAINT write_off_requests_one_target CHECK ((product_variant_id IS NULL) <> (inventory_id IS NULL)),
  CONSTRAINT write_off_requests_decided CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_write_off_requests_pending ON write_off_requests (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_write_off_requests_shift ON write_off_requests (shift_id);

ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS write_off_request_id INTEGER REFERENCES write_off_requests(request_id);

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS reversed_after_made BOOLEAN;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS wasted_cost NUMERIC(12, 2) CHECK (wasted_cost >= 0);

-- Keeps the table out of the Supabase Data API. The apps connect as the owner and are not affected.
ALTER TABLE write_off_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON write_off_requests FROM anon, authenticated;
