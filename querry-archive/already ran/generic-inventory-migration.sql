-- Generic inventory + product types migration
--
-- Moves the system from "every inventory item is an ingredient / every product is a recipe"
-- to a general POS model:
--   * products.product_type distinguishes recipe products (Americano) from direct-sale stock
--     products (Coke Can). A stock product's variant has exactly one component row in
--     variant_ingredients (e.g. Coke Can x 1 piece), so checkout deduction, availability,
--     void/refund restoration and the inventory log all work unchanged for both types.
--   * inventory.unit_cost stores the purchase/market cost per unit of measure (per gram,
--     per mL, per piece...). NULL means "not entered yet", never a fake zero.
--   * sales_order_items / sales_order_item_additions snapshot the cost at the time of sale,
--     so later cost changes never rewrite historical gross profit.
--   * product_variants.temperature may now be NULL for products where hot/cold does not
--     apply (packaged drinks, snacks).
--
-- Purely additive: no tables or columns are dropped and every existing product becomes
-- 'recipe', so current behavior is unchanged. product_additions is no longer read by the
-- apps (additions can now be attached to any cart item) but is left in place.
--
-- Run once before deploying the matching app code. Safe to run more than once.

-- 1) Product type
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'recipe';
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_product_type;
ALTER TABLE products ADD CONSTRAINT chk_products_product_type
  CHECK (product_type IN ('recipe', 'stock'));

-- 2) Inventory cost per unit of measure
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 4);
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_inventory_unit_cost;
ALTER TABLE inventory ADD CONSTRAINT chk_inventory_unit_cost
  CHECK (unit_cost IS NULL OR unit_cost >= 0);

-- 3) Cost snapshots on sales lines (cost of ONE unit of the line at time of sale)
ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 4);
ALTER TABLE sales_order_item_additions
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 4);

-- 4) Variants without a temperature (existing CHECK hot/cold still applies when set)
ALTER TABLE product_variants ALTER COLUMN temperature DROP NOT NULL;

-- 5) Log cost changes alongside quantity changes
ALTER TABLE inventory_log DROP CONSTRAINT IF EXISTS inventory_log_change_type_check;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_change_type_check CHECK (change_type IN (
  'created', 'restocked', 'manual_edit', 'order_deduction',
  'void_restore', 'refund_restore', 'deleted',
  'archived', 'restored', 'purged', 'cost_updated'
));
ALTER TABLE inventory_log
  ADD COLUMN IF NOT EXISTS unit_cost_before NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS unit_cost_after NUMERIC(12, 4);
