-- Bound (derived) inventory items migration
--
-- Lets an inventory item (e.g. "Espresso Shot") carry no stock of its own and instead
-- draw its stock live from another inventory item (e.g. "Regular Coffee Bean") at a
-- fixed ratio (e.g. 18 grams of beans per shot). Checkout/order deduction resolves a
-- bound item's usage through to its source item automatically.
--
-- Safe to run more than once.

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS derived_from_inventory_id INTEGER REFERENCES inventory(inventory_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS derived_ratio NUMERIC(12, 4);

-- A bound item must always carry a positive ratio, and can never bind to itself.
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_inventory_derived_ratio;
ALTER TABLE inventory ADD CONSTRAINT chk_inventory_derived_ratio
  CHECK (derived_from_inventory_id IS NULL OR (derived_ratio IS NOT NULL AND derived_ratio > 0));

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_inventory_derived_not_self;
ALTER TABLE inventory ADD CONSTRAINT chk_inventory_derived_not_self
  CHECK (derived_from_inventory_id IS NULL OR derived_from_inventory_id <> inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_derived_from ON inventory (derived_from_inventory_id);
