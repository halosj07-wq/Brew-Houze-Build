-- Add-on stations: bar add-ons for drinks, kitchen add-ons for food
--
-- 1. additions.station: bar or kitchen, like products. An add-on only goes on an item made at the
--    same station, so a Caramel Drizzle can no longer be put on an Egg Drop. The Staff Portal only
--    offers the add-ons of the selected item, the mobile menu only lists matching add-ons on each
--    product, and checkout refuses a mismatch. Existing add-ons stay bar add-ons.
-- 2. Six kitchen add-ons to start with: Extra Rice, Extra Egg, Extra Cheese, Extra Bacon,
--    Extra Gravy and Extra Cheese Sauce, each using an item from the food menu seed. One is skipped
--    if its inventory item is missing or an add-on with that name already exists.
--
-- Run in the Supabase SQL editor. Safe to run again.

BEGIN;

ALTER TABLE additions ADD COLUMN IF NOT EXISTS station TEXT NOT NULL DEFAULT 'bar';
ALTER TABLE additions DROP CONSTRAINT IF EXISTS additions_station_check;
ALTER TABLE additions ADD CONSTRAINT additions_station_check CHECK (station IN ('bar', 'kitchen'));

INSERT INTO additions (addition_name, inventory_id, quantity, price, station)
SELECT a.addition_name, i.inventory_id, a.quantity, a.price, 'kitchen'
FROM (VALUES
  ('Extra Rice', 'Rice', 150, 25),
  ('Extra Egg', 'Eggs', 1, 20),
  ('Extra Cheese', 'Mozzarella', 30, 30),
  ('Extra Bacon', 'Bacon', 30, 40),
  ('Extra Gravy', 'Mushroom Gravy', 60, 15),
  ('Extra Cheese Sauce', 'Cheese Sauce', 40, 25)
) AS a(addition_name, item_name, quantity, price)
JOIN inventory i ON i.item_name = a.item_name AND i.is_archived = FALSE
WHERE NOT EXISTS (SELECT 1 FROM additions existing WHERE LOWER(existing.addition_name) = LOWER(a.addition_name));

COMMIT;
