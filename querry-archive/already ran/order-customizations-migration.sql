-- Order customizations: less or none of an ingredient, plus a request note, per cart line
--
-- 1. inventory.is_customizable: the admin marks items a customer may ask for less of or none of
--    (lids, straws, whipped cream, syrups, onions and so on). In the Staff Portal, the cashier can
--    then set that item to Less (half is used) or None (nothing is used) on one cart line.
-- 2. sales_order_items.customizations: what was changed on that line, saved with the order as
--    [{ inventory_id, name, level }] where level is less or none. Stock is deducted to match, and
--    a void or refund puts back exactly what was used (from the stock log).
-- 3. sales_order_items.item_note: a short request that is not an inventory item, such as less ice
--    or extra hot. Shown on the queue, the receipt and in Finance.
--
-- A starting list of common items is marked customizable. The admin can change any of them in
-- Inventory.
--
-- Run in the Supabase SQL editor. Safe to run again.

BEGIN;

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS customizations JSONB;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS item_note TEXT;

ALTER TABLE sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_item_note_length;
ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_item_note_length CHECK (item_note IS NULL OR LENGTH(item_note) <= 120);

ALTER TABLE sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_customizations_array;
ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_customizations_array CHECK (customizations IS NULL OR jsonb_typeof(customizations) = 'array');

-- Common items customers ask to change
UPDATE inventory SET is_customizable = TRUE
WHERE is_archived = FALSE
  AND is_customizable = FALSE
  AND item_name IN (
    'Lids', 'Straws', 'Whipping Cream',
    'Vanilla Syrup', 'Hazelnut Syrup', 'Salted Caramel Syrup', 'Sugar Syrup', 'Honey',
    'Caramel Sauce', 'Chocolate Sauce', 'White Chocolate Sauce', 'Condensed Milk',
    'Onions', 'Garlic', 'Lettuce', 'Tomatoes', 'Japanese Mayo', 'Cheese Slices', 'Sriracha'
  );

COMMIT;
