-- Inventory packaging migration
--
-- Adds a level above stock items: how an item is bought. Stock still lives in one place, the
-- stock item, in the unit recipes use (grams, mL, pieces). Packaging only describes the pack:
--
--   Nescafe Bean Bag 1 kg (packaging)  ->  Coffee Bean, grams (stock item)  ->  Espresso Shot (bound item)
--   Selecta Whole Milk 1 L (packaging) ->  Whole Milk, mL (stock item)
--
-- A stock item can have several packagings, for example one per brand, so switching brands never
-- requires editing recipes. Restocking by package adds packs x contents to the stock item and
-- updates its unit cost as a weighted average of the stock on hand and the new packs.
--
-- inventory_log gains the packaging used, number of packs and price per pack, so restock
-- entries double as a purchase history.
--
-- Written so it also runs in SQL consoles that split scripts on every semicolon: no
-- semicolons or quote marks inside strings or comments. Purely additive, safe to run more
-- than once. Run before deploying the matching admin app code.

CREATE TABLE IF NOT EXISTS inventory_packaging (
  packaging_id SERIAL PRIMARY KEY,
  inventory_id INTEGER NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
  packaging_name TEXT NOT NULL,
  brand TEXT,
  content_quantity NUMERIC(14, 4) NOT NULL CHECK (content_quantity > 0),
  last_pack_price NUMERIC(12, 2) CHECK (last_pack_price IS NULL OR last_pack_price >= 0),
  last_restocked_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_packaging_inventory_id ON inventory_packaging (inventory_id);

-- Two active packagings of the same item cannot share a name.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_packaging_active_name_idx
  ON inventory_packaging (inventory_id, LOWER(packaging_name))
  WHERE is_archived = FALSE;

-- Restock entries record which pack was bought. The name is copied so the history stays readable
-- even after a packaging is archived or its item is permanently deleted.
ALTER TABLE inventory_log
  ADD COLUMN IF NOT EXISTS packaging_id INTEGER REFERENCES inventory_packaging(packaging_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS packaging_name TEXT,
  ADD COLUMN IF NOT EXISTS packs_added INTEGER,
  ADD COLUMN IF NOT EXISTS pack_price NUMERIC(12, 2);
