-- Menu seed: the official Brew Houze menu (Brew Houze Cafe, Nagcarlan, Laguna)
--
-- Sets up the menu the way it is printed, with the printed prices:
--   6 categories: Classic, Especials, Cold, Frappe, Especials Frappe, Ice Teas & Mojitos
--   44 drinks with their sizes. Classic is 8 and 12 oz hot, 16 and 22 oz hot or iced.
--   Especials is 12 oz hot, 16 and 22 oz hot or iced. Cold is 12 oz hot, 16 and 22 oz iced.
--   Frappes, iced teas and mojitos are 16 and 22 oz iced.
--   23 new inventory items (cups 8 and 22 oz, straws, syrups, gelato, tea, mojito items),
--   each logged in stock history as created, with a package and pack price so costs work.
--
-- The 7 drinks already in the system keep their sales history and are moved onto the menu:
--   Cafe Latte becomes Latte, Cafe Mocha becomes Mocha, Matcha Latte becomes Caramel Matcha,
--   Chocolate becomes Caramel Chocolate. Americano, Spanish Latte and Caramel Macchiato keep
--   their names. Sizes that are not on the menu are archived, not deleted, so past orders
--   still show them. Their recipes are rewritten once to match the new sizes.
--
-- Recipes and ingredient costs are estimates (the menu does not print them). Adjust them in
-- Menu and Inventory. Mojito prices are without alcohol. Bottled Water, the cookie, Drinks,
-- Pastries and the add-ons are not touched. The old categories Espresso Based and Non-Coffee
-- are turned off once nothing uses them.
--
-- Run in the Supabase SQL editor. Safe to run again: nothing is added twice, and drinks that
-- already have a recipe keep it.

BEGIN;

-- Categories
INSERT INTO product_categories (category_name, is_active) VALUES
  ('Classic', TRUE),
  ('Especials', TRUE),
  ('Cold', TRUE),
  ('Frappe', TRUE),
  ('Especials Frappe', TRUE),
  ('Ice Teas & Mojitos', TRUE)
ON CONFLICT (category_name) DO UPDATE SET is_active = TRUE;

-- New inventory items, each with its package and a created entry in stock history
WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Packaging', 'Cups 8 oz', 'Pieces', 200, 50, TRUE, 3.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cups 8 oz' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Sleeve of 50', NULL, 50, 150, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 4, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Packaging', 'Cups 22 oz', 'Pieces', 200, 50, TRUE, 5.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cups 22 oz' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Sleeve of 50', NULL, 50, 250, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 4, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Packaging', 'Straws', 'Pieces', 500, 100, TRUE, 0.5
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Straws' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 100', NULL, 100, 50, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 5, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Hazelnut Syrup', 'mL', 1500, 150, FALSE, 0.56
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Hazelnut Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '750 mL bottle', NULL, 750, 420, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Salted Caramel Syrup', 'mL', 1500, 150, FALSE, 0.56
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Salted Caramel Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '750 mL bottle', NULL, 750, 420, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Strawberry Syrup', 'mL', 2000, 200, FALSE, 0.45
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Strawberry Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Peach Mango Syrup', 'mL', 2000, 200, FALSE, 0.45
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Peach Mango Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Passion Fruit Syrup', 'mL', 1000, 200, FALSE, 0.45
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Passion Fruit Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Blueberry Syrup', 'mL', 1000, 200, FALSE, 0.45
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Blueberry Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Sugar Syrup', 'mL', 2000, 300, FALSE, 0.12
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Sugar Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 120, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Sauces', 'White Chocolate Sauce', 'mL', 1000, 200, FALSE, 0.48
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'White Chocolate Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 480, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Dairy', 'Almond Milk', 'mL', 3000, 1000, FALSE, 0.22
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Almond Milk' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L carton', NULL, 1000, 220, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Dairy', 'Whipping Cream', 'mL', 2000, 500, FALSE, 0.28
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Whipping Cream' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L carton', NULL, 1000, 280, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Dairy', 'Cream Cheese', 'grams', 1000, 250, FALSE, 0.6
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cream Cheese' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg block', NULL, 1000, 600, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Dairy', 'Fior di Latte Gelato', 'grams', 5000, 1000, FALSE, 0.5
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Fior di Latte Gelato' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '2.5 kg tub', NULL, 2500, 1250, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Powders', 'Frappe Base Powder', 'grams', 2000, 400, FALSE, 0.65
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Frappe Base Powder' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 650, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Toppings', 'Crushed Oreo', 'grams', 1000, 200, FALSE, 0.56
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Crushed Oreo' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 g pack', NULL, 500, 280, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Toppings', 'Java Chips', 'grams', 1000, 200, FALSE, 0.6
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Java Chips' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 600, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Tea', 'Black Tea Leaves', 'grams', 1000, 200, FALSE, 0.9
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Black Tea Leaves' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 g pack', NULL, 500, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Tea', 'Honey', 'mL', 1000, 200, FALSE, 0.55
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Honey' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 550, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Mojito', 'Lemon Juice', 'mL', 2000, 300, FALSE, 0.25
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Lemon Juice' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', NULL, 1000, 250, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Mojito', 'Mint Leaves', 'grams', 300, 50, FALSE, 0.8
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Mint Leaves' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '100 g pack', NULL, 100, 80, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Mojito', 'Soda Water', 'mL', 9000, 1500, FALSE, 0.04
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Soda Water' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1.5 L bottle', NULL, 1500, 60, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 6, pack.last_pack_price
FROM item CROSS JOIN pack;

-- The menu, as working tables for this script only
CREATE TEMP TABLE seed_products (product_name TEXT, old_name TEXT, category TEXT, description TEXT) ON COMMIT DROP;
INSERT INTO seed_products VALUES
  ('Americano', 'Americano', 'Classic', 'Espresso and hot water, or over ice.'),
  ('Espresso', NULL, 'Classic', 'Straight espresso, pulled to order.'),
  ('Macchiato', NULL, 'Classic', 'Espresso marked with a little foamed milk.'),
  ('Cappuccino', NULL, 'Classic', 'Espresso with steamed milk and thick foam.'),
  ('Latte', 'Cafe Latte', 'Classic', 'Espresso with steamed or cold milk.'),
  ('Flat White', NULL, 'Classic', 'A stronger, silkier latte with less foam.'),
  ('Spanish Latte', 'Spanish Latte', 'Classic', 'Latte sweetened with condensed milk.'),
  ('Caramel Chocolate', 'Chocolate', 'Especials', 'Rich chocolate and caramel with milk, no coffee.'),
  ('Vanilla Latte', NULL, 'Especials', 'Latte sweetened with vanilla.'),
  ('Marocchino', NULL, 'Especials', 'Espresso, chocolate and foamed milk.'),
  ('Tropical Brew Houze', NULL, 'Especials', 'House special. Espresso over peach mango and sparkling water.'),
  ('Caramel Macchiato', 'Caramel Macchiato', 'Especials', 'Vanilla milk, espresso and caramel on top.'),
  ('Winter Brew Houze', NULL, 'Especials', 'House special. White chocolate latte with whipped cream.'),
  ('Caramel Matcha', 'Matcha Latte', 'Especials', 'Matcha with milk and caramel.'),
  ('Strawberry Matcha', NULL, 'Especials', 'Matcha and milk over strawberry.'),
  ('Mocha', 'Cafe Mocha', 'Cold', 'Espresso, chocolate and milk.'),
  ('Hazelnut Latte', NULL, 'Cold', 'Latte with hazelnut.'),
  ('Vanilla Hazelnut', NULL, 'Cold', 'Latte with vanilla and hazelnut.'),
  ('Salted Caramel', NULL, 'Cold', 'Latte with salted caramel.'),
  ('Thai Strawberry Espresso', NULL, 'Cold', 'Strawberry, sweet milk and espresso, layered over ice.'),
  ('Almond Milk Espresso', NULL, 'Cold', 'Espresso over almond milk and ice.'),
  ('Affogato', NULL, 'Cold', 'Especial serving. Two scoops of fior di latte gelato with two shots of espresso.'),
  ('Cappuccino Frappe', NULL, 'Frappe', 'Blended cappuccino.'),
  ('Latte Frappe', NULL, 'Frappe', 'Blended latte.'),
  ('Salted Caramel Latte Frappe', NULL, 'Frappe', 'Blended latte with salted caramel and whipped cream.'),
  ('Espresso Frappe', NULL, 'Frappe', 'Blended with an extra shot.'),
  ('Mocha Frappe', NULL, 'Frappe', 'Blended espresso and chocolate.'),
  ('Vanilla Frappe', NULL, 'Frappe', 'Blended vanilla cream, no coffee.'),
  ('Chocolate Caramel Frappe', NULL, 'Frappe', 'Blended chocolate and caramel with whipped cream, no coffee.'),
  ('Java Chip Frappe', NULL, 'Especials Frappe', 'Mocha frappe blended with chocolate chips.'),
  ('Vanilla Hazelnut Oreo Frappe', NULL, 'Especials Frappe', 'Vanilla and hazelnut blended with Oreo crumbs.'),
  ('Strawberry Choco Espresso Frappe', NULL, 'Especials Frappe', 'Strawberry, chocolate and espresso, blended.'),
  ('Summer Brew Houze Frappe', NULL, 'Especials Frappe', 'House special. Peach mango and passion fruit, blended, no coffee.'),
  ('Matcha Frappe', NULL, 'Especials Frappe', 'Blended matcha with whipped cream.'),
  ('Cheesecake Tiramisu Frappe', NULL, 'Especials Frappe', 'Espresso, cream cheese and chocolate, blended.'),
  ('White Winter Frappe', NULL, 'Especials Frappe', 'House special. White chocolate and espresso, blended.'),
  ('Fior di Latte Frappe', NULL, 'Especials Frappe', 'Fior di latte gelato blended with milk and cream.'),
  ('Honey Blend Iced Tea', NULL, 'Ice Teas & Mojitos', 'Black tea sweetened with honey.'),
  ('Vanilla Fruity Iced Tea', NULL, 'Ice Teas & Mojitos', 'Black tea with vanilla and strawberry.'),
  ('Peach Mango Iced Tea', NULL, 'Ice Teas & Mojitos', 'Black tea with peach mango.'),
  ('Lemon Mojito', NULL, 'Ice Teas & Mojitos', 'Lemon, mint and soda, no alcohol.'),
  ('Strawberry Mojito', NULL, 'Ice Teas & Mojitos', 'Strawberry, lemon, mint and soda, no alcohol.'),
  ('Passion Fruit Mojito', NULL, 'Ice Teas & Mojitos', 'Passion fruit, lemon, mint and soda, no alcohol.'),
  ('Blueberry Mojito', NULL, 'Ice Teas & Mojitos', 'Blueberry, lemon, mint and soda, no alcohol.');

CREATE TEMP TABLE seed_variants (product_name TEXT, size_label TEXT, temperature TEXT, price NUMERIC) ON COMMIT DROP;
INSERT INTO seed_variants VALUES
  ('Americano', '8 oz', 'hot', 50),
  ('Americano', '12 oz', 'hot', 65),
  ('Americano', '16 oz', 'hot', 80),
  ('Americano', '16 oz', 'cold', 80),
  ('Americano', '22 oz', 'hot', 90),
  ('Americano', '22 oz', 'cold', 90),
  ('Espresso', '8 oz', 'hot', 50),
  ('Espresso', '12 oz', 'hot', 65),
  ('Espresso', '16 oz', 'hot', 80),
  ('Espresso', '16 oz', 'cold', 80),
  ('Espresso', '22 oz', 'hot', 90),
  ('Espresso', '22 oz', 'cold', 90),
  ('Macchiato', '8 oz', 'hot', 75),
  ('Macchiato', '12 oz', 'hot', 90),
  ('Macchiato', '16 oz', 'hot', 95),
  ('Macchiato', '16 oz', 'cold', 95),
  ('Macchiato', '22 oz', 'hot', 110),
  ('Macchiato', '22 oz', 'cold', 110),
  ('Cappuccino', '8 oz', 'hot', 85),
  ('Cappuccino', '12 oz', 'hot', 90),
  ('Cappuccino', '16 oz', 'hot', 100),
  ('Cappuccino', '16 oz', 'cold', 100),
  ('Cappuccino', '22 oz', 'hot', 110),
  ('Cappuccino', '22 oz', 'cold', 110),
  ('Latte', '8 oz', 'hot', 65),
  ('Latte', '12 oz', 'hot', 85),
  ('Latte', '16 oz', 'hot', 95),
  ('Latte', '16 oz', 'cold', 95),
  ('Latte', '22 oz', 'hot', 115),
  ('Latte', '22 oz', 'cold', 115),
  ('Flat White', '8 oz', 'hot', 65),
  ('Flat White', '12 oz', 'hot', 85),
  ('Flat White', '16 oz', 'hot', 95),
  ('Flat White', '16 oz', 'cold', 95),
  ('Flat White', '22 oz', 'hot', 115),
  ('Flat White', '22 oz', 'cold', 115),
  ('Spanish Latte', '8 oz', 'hot', 65),
  ('Spanish Latte', '12 oz', 'hot', 90),
  ('Spanish Latte', '16 oz', 'hot', 100),
  ('Spanish Latte', '16 oz', 'cold', 100),
  ('Spanish Latte', '22 oz', 'hot', 120),
  ('Spanish Latte', '22 oz', 'cold', 120),
  ('Caramel Chocolate', '12 oz', 'hot', 75),
  ('Caramel Chocolate', '16 oz', 'hot', 90),
  ('Caramel Chocolate', '16 oz', 'cold', 90),
  ('Caramel Chocolate', '22 oz', 'hot', 110),
  ('Caramel Chocolate', '22 oz', 'cold', 110),
  ('Vanilla Latte', '12 oz', 'hot', 75),
  ('Vanilla Latte', '16 oz', 'hot', 90),
  ('Vanilla Latte', '16 oz', 'cold', 90),
  ('Vanilla Latte', '22 oz', 'hot', 110),
  ('Vanilla Latte', '22 oz', 'cold', 110),
  ('Marocchino', '12 oz', 'hot', 75),
  ('Marocchino', '16 oz', 'hot', 90),
  ('Marocchino', '16 oz', 'cold', 90),
  ('Marocchino', '22 oz', 'hot', 110),
  ('Marocchino', '22 oz', 'cold', 110),
  ('Tropical Brew Houze', '12 oz', 'hot', 80),
  ('Tropical Brew Houze', '16 oz', 'hot', 95),
  ('Tropical Brew Houze', '16 oz', 'cold', 95),
  ('Tropical Brew Houze', '22 oz', 'hot', 120),
  ('Tropical Brew Houze', '22 oz', 'cold', 120),
  ('Caramel Macchiato', '12 oz', 'hot', 85),
  ('Caramel Macchiato', '16 oz', 'hot', 105),
  ('Caramel Macchiato', '16 oz', 'cold', 105),
  ('Caramel Macchiato', '22 oz', 'hot', 115),
  ('Caramel Macchiato', '22 oz', 'cold', 115),
  ('Winter Brew Houze', '12 oz', 'hot', 75),
  ('Winter Brew Houze', '16 oz', 'hot', 90),
  ('Winter Brew Houze', '16 oz', 'cold', 90),
  ('Winter Brew Houze', '22 oz', 'hot', 110),
  ('Winter Brew Houze', '22 oz', 'cold', 110),
  ('Caramel Matcha', '12 oz', 'hot', 90),
  ('Caramel Matcha', '16 oz', 'hot', 115),
  ('Caramel Matcha', '16 oz', 'cold', 115),
  ('Caramel Matcha', '22 oz', 'hot', 125),
  ('Caramel Matcha', '22 oz', 'cold', 125),
  ('Strawberry Matcha', '12 oz', 'hot', 90),
  ('Strawberry Matcha', '16 oz', 'hot', 115),
  ('Strawberry Matcha', '16 oz', 'cold', 115),
  ('Strawberry Matcha', '22 oz', 'hot', 125),
  ('Strawberry Matcha', '22 oz', 'cold', 125),
  ('Mocha', '12 oz', 'hot', 80),
  ('Mocha', '16 oz', 'cold', 100),
  ('Mocha', '22 oz', 'cold', 115),
  ('Hazelnut Latte', '12 oz', 'hot', 90),
  ('Hazelnut Latte', '16 oz', 'cold', 105),
  ('Hazelnut Latte', '22 oz', 'cold', 120),
  ('Vanilla Hazelnut', '12 oz', 'hot', 90),
  ('Vanilla Hazelnut', '16 oz', 'cold', 110),
  ('Vanilla Hazelnut', '22 oz', 'cold', 120),
  ('Salted Caramel', '12 oz', 'hot', 90),
  ('Salted Caramel', '16 oz', 'cold', 110),
  ('Salted Caramel', '22 oz', 'cold', 120),
  ('Thai Strawberry Espresso', '16 oz', 'cold', 110),
  ('Thai Strawberry Espresso', '22 oz', 'cold', 130),
  ('Almond Milk Espresso', '16 oz', 'cold', 115),
  ('Almond Milk Espresso', '22 oz', 'cold', 125),
  ('Affogato', 'Regular', NULL, 110),
  ('Cappuccino Frappe', '16 oz', 'cold', 100),
  ('Cappuccino Frappe', '22 oz', 'cold', 120),
  ('Latte Frappe', '16 oz', 'cold', 100),
  ('Latte Frappe', '22 oz', 'cold', 120),
  ('Salted Caramel Latte Frappe', '16 oz', 'cold', 115),
  ('Salted Caramel Latte Frappe', '22 oz', 'cold', 125),
  ('Espresso Frappe', '16 oz', 'cold', 95),
  ('Espresso Frappe', '22 oz', 'cold', 115),
  ('Mocha Frappe', '16 oz', 'cold', 100),
  ('Mocha Frappe', '22 oz', 'cold', 120),
  ('Vanilla Frappe', '16 oz', 'cold', 100),
  ('Vanilla Frappe', '22 oz', 'cold', 120),
  ('Chocolate Caramel Frappe', '16 oz', 'cold', 115),
  ('Chocolate Caramel Frappe', '22 oz', 'cold', 125),
  ('Java Chip Frappe', '16 oz', 'cold', 115),
  ('Java Chip Frappe', '22 oz', 'cold', 130),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', 'cold', 115),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', 'cold', 130),
  ('Strawberry Choco Espresso Frappe', '16 oz', 'cold', 110),
  ('Strawberry Choco Espresso Frappe', '22 oz', 'cold', 120),
  ('Summer Brew Houze Frappe', '16 oz', 'cold', 110),
  ('Summer Brew Houze Frappe', '22 oz', 'cold', 120),
  ('Matcha Frappe', '16 oz', 'cold', 115),
  ('Matcha Frappe', '22 oz', 'cold', 125),
  ('Cheesecake Tiramisu Frappe', '16 oz', 'cold', 110),
  ('Cheesecake Tiramisu Frappe', '22 oz', 'cold', 120),
  ('White Winter Frappe', '22 oz', 'cold', 150),
  ('Fior di Latte Frappe', '22 oz', 'cold', 150),
  ('Honey Blend Iced Tea', '16 oz', 'cold', 65),
  ('Honey Blend Iced Tea', '22 oz', 'cold', 85),
  ('Vanilla Fruity Iced Tea', '16 oz', 'cold', 75),
  ('Vanilla Fruity Iced Tea', '22 oz', 'cold', 95),
  ('Peach Mango Iced Tea', '16 oz', 'cold', 75),
  ('Peach Mango Iced Tea', '22 oz', 'cold', 95),
  ('Lemon Mojito', '16 oz', 'cold', 85),
  ('Lemon Mojito', '22 oz', 'cold', 110),
  ('Strawberry Mojito', '16 oz', 'cold', 95),
  ('Strawberry Mojito', '22 oz', 'cold', 115),
  ('Passion Fruit Mojito', '16 oz', 'cold', 85),
  ('Passion Fruit Mojito', '22 oz', 'cold', 110),
  ('Blueberry Mojito', '16 oz', 'cold', 85),
  ('Blueberry Mojito', '22 oz', 'cold', 110);

-- A recipe line with no temperature is used for hot and iced alike
CREATE TEMP TABLE seed_recipes (product_name TEXT, size_label TEXT, temperature TEXT, item_name TEXT, qty NUMERIC) ON COMMIT DROP;
INSERT INTO seed_recipes VALUES
  ('Americano', '8 oz', NULL, 'Espresso Shot', 1),
  ('Americano', '8 oz', NULL, 'Cups 8 oz', 1),
  ('Americano', '8 oz', NULL, 'Lids', 1),
  ('Americano', '12 oz', NULL, 'Espresso Shot', 2),
  ('Americano', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Americano', '12 oz', NULL, 'Lids', 1),
  ('Americano', '16 oz', NULL, 'Espresso Shot', 2),
  ('Americano', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Americano', '16 oz', NULL, 'Lids', 1),
  ('Americano', '16 oz', 'cold', 'Straws', 1),
  ('Americano', '22 oz', NULL, 'Espresso Shot', 3),
  ('Americano', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Americano', '22 oz', NULL, 'Lids', 1),
  ('Americano', '22 oz', 'cold', 'Straws', 1),
  ('Espresso', '8 oz', NULL, 'Espresso Shot', 1),
  ('Espresso', '8 oz', NULL, 'Cups 8 oz', 1),
  ('Espresso', '8 oz', NULL, 'Lids', 1),
  ('Espresso', '12 oz', NULL, 'Espresso Shot', 2),
  ('Espresso', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Espresso', '12 oz', NULL, 'Lids', 1),
  ('Espresso', '16 oz', NULL, 'Espresso Shot', 2),
  ('Espresso', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Espresso', '16 oz', NULL, 'Lids', 1),
  ('Espresso', '16 oz', 'cold', 'Straws', 1),
  ('Espresso', '22 oz', NULL, 'Espresso Shot', 3),
  ('Espresso', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Espresso', '22 oz', NULL, 'Lids', 1),
  ('Espresso', '22 oz', 'cold', 'Straws', 1),
  ('Macchiato', '8 oz', NULL, 'Espresso Shot', 1),
  ('Macchiato', '8 oz', NULL, 'Fresh Milk', 60),
  ('Macchiato', '8 oz', NULL, 'Cups 8 oz', 1),
  ('Macchiato', '8 oz', NULL, 'Lids', 1),
  ('Macchiato', '12 oz', NULL, 'Espresso Shot', 2),
  ('Macchiato', '12 oz', NULL, 'Fresh Milk', 80),
  ('Macchiato', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Macchiato', '12 oz', NULL, 'Lids', 1),
  ('Macchiato', '16 oz', NULL, 'Espresso Shot', 2),
  ('Macchiato', '16 oz', NULL, 'Fresh Milk', 96),
  ('Macchiato', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Macchiato', '16 oz', NULL, 'Lids', 1),
  ('Macchiato', '16 oz', 'cold', 'Straws', 1),
  ('Macchiato', '22 oz', NULL, 'Espresso Shot', 3),
  ('Macchiato', '22 oz', NULL, 'Fresh Milk', 136),
  ('Macchiato', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Macchiato', '22 oz', NULL, 'Lids', 1),
  ('Macchiato', '22 oz', 'cold', 'Straws', 1),
  ('Cappuccino', '8 oz', NULL, 'Espresso Shot', 1),
  ('Cappuccino', '8 oz', NULL, 'Fresh Milk', 112),
  ('Cappuccino', '8 oz', NULL, 'Cups 8 oz', 1),
  ('Cappuccino', '8 oz', NULL, 'Lids', 1),
  ('Cappuccino', '12 oz', NULL, 'Espresso Shot', 2),
  ('Cappuccino', '12 oz', NULL, 'Fresh Milk', 150),
  ('Cappuccino', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Cappuccino', '12 oz', NULL, 'Lids', 1),
  ('Cappuccino', '16 oz', NULL, 'Espresso Shot', 2),
  ('Cappuccino', '16 oz', NULL, 'Fresh Milk', 180),
  ('Cappuccino', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Cappuccino', '16 oz', NULL, 'Lids', 1),
  ('Cappuccino', '16 oz', 'cold', 'Straws', 1),
  ('Cappuccino', '22 oz', NULL, 'Espresso Shot', 3),
  ('Cappuccino', '22 oz', NULL, 'Fresh Milk', 255),
  ('Cappuccino', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Cappuccino', '22 oz', NULL, 'Lids', 1),
  ('Cappuccino', '22 oz', 'cold', 'Straws', 1),
  ('Latte', '8 oz', NULL, 'Espresso Shot', 1),
  ('Latte', '8 oz', NULL, 'Fresh Milk', 150),
  ('Latte', '8 oz', NULL, 'Cups 8 oz', 1),
  ('Latte', '8 oz', NULL, 'Lids', 1),
  ('Latte', '12 oz', NULL, 'Espresso Shot', 2),
  ('Latte', '12 oz', NULL, 'Fresh Milk', 200),
  ('Latte', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Latte', '12 oz', NULL, 'Lids', 1),
  ('Latte', '16 oz', NULL, 'Espresso Shot', 2),
  ('Latte', '16 oz', NULL, 'Fresh Milk', 240),
  ('Latte', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Latte', '16 oz', NULL, 'Lids', 1),
  ('Latte', '16 oz', 'cold', 'Straws', 1),
  ('Latte', '22 oz', NULL, 'Espresso Shot', 3),
  ('Latte', '22 oz', NULL, 'Fresh Milk', 340),
  ('Latte', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Latte', '22 oz', NULL, 'Lids', 1),
  ('Latte', '22 oz', 'cold', 'Straws', 1),
  ('Flat White', '8 oz', NULL, 'Espresso Shot', 2),
  ('Flat White', '8 oz', NULL, 'Fresh Milk', 120),
  ('Flat White', '8 oz', NULL, 'Cups 8 oz', 1),
  ('Flat White', '8 oz', NULL, 'Lids', 1),
  ('Flat White', '12 oz', NULL, 'Espresso Shot', 3),
  ('Flat White', '12 oz', NULL, 'Fresh Milk', 160),
  ('Flat White', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Flat White', '12 oz', NULL, 'Lids', 1),
  ('Flat White', '16 oz', NULL, 'Espresso Shot', 3),
  ('Flat White', '16 oz', NULL, 'Fresh Milk', 192),
  ('Flat White', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Flat White', '16 oz', NULL, 'Lids', 1),
  ('Flat White', '16 oz', 'cold', 'Straws', 1),
  ('Flat White', '22 oz', NULL, 'Espresso Shot', 4),
  ('Flat White', '22 oz', NULL, 'Fresh Milk', 272),
  ('Flat White', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Flat White', '22 oz', NULL, 'Lids', 1),
  ('Flat White', '22 oz', 'cold', 'Straws', 1),
  ('Spanish Latte', '8 oz', NULL, 'Espresso Shot', 1),
  ('Spanish Latte', '8 oz', NULL, 'Fresh Milk', 128),
  ('Spanish Latte', '8 oz', NULL, 'Condensed Milk', 20),
  ('Spanish Latte', '8 oz', NULL, 'Cups 8 oz', 1),
  ('Spanish Latte', '8 oz', NULL, 'Lids', 1),
  ('Spanish Latte', '12 oz', NULL, 'Espresso Shot', 2),
  ('Spanish Latte', '12 oz', NULL, 'Fresh Milk', 170),
  ('Spanish Latte', '12 oz', NULL, 'Condensed Milk', 30),
  ('Spanish Latte', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Spanish Latte', '12 oz', NULL, 'Lids', 1),
  ('Spanish Latte', '16 oz', NULL, 'Espresso Shot', 2),
  ('Spanish Latte', '16 oz', NULL, 'Fresh Milk', 204),
  ('Spanish Latte', '16 oz', NULL, 'Condensed Milk', 35),
  ('Spanish Latte', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Spanish Latte', '16 oz', NULL, 'Lids', 1),
  ('Spanish Latte', '16 oz', 'cold', 'Straws', 1),
  ('Spanish Latte', '22 oz', NULL, 'Espresso Shot', 3),
  ('Spanish Latte', '22 oz', NULL, 'Fresh Milk', 289),
  ('Spanish Latte', '22 oz', NULL, 'Condensed Milk', 50),
  ('Spanish Latte', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Spanish Latte', '22 oz', NULL, 'Lids', 1),
  ('Spanish Latte', '22 oz', 'cold', 'Straws', 1),
  ('Caramel Chocolate', '12 oz', NULL, 'Fresh Milk', 200),
  ('Caramel Chocolate', '12 oz', NULL, 'Chocolate Sauce', 20),
  ('Caramel Chocolate', '12 oz', NULL, 'Caramel Sauce', 12),
  ('Caramel Chocolate', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Caramel Chocolate', '12 oz', NULL, 'Lids', 1),
  ('Caramel Chocolate', '16 oz', NULL, 'Fresh Milk', 240),
  ('Caramel Chocolate', '16 oz', NULL, 'Chocolate Sauce', 25),
  ('Caramel Chocolate', '16 oz', NULL, 'Caramel Sauce', 15),
  ('Caramel Chocolate', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Caramel Chocolate', '16 oz', NULL, 'Lids', 1),
  ('Caramel Chocolate', '16 oz', 'cold', 'Straws', 1),
  ('Caramel Chocolate', '22 oz', NULL, 'Fresh Milk', 340),
  ('Caramel Chocolate', '22 oz', NULL, 'Chocolate Sauce', 35),
  ('Caramel Chocolate', '22 oz', NULL, 'Caramel Sauce', 21),
  ('Caramel Chocolate', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Caramel Chocolate', '22 oz', NULL, 'Lids', 1),
  ('Caramel Chocolate', '22 oz', 'cold', 'Straws', 1),
  ('Vanilla Latte', '12 oz', NULL, 'Espresso Shot', 2),
  ('Vanilla Latte', '12 oz', NULL, 'Fresh Milk', 200),
  ('Vanilla Latte', '12 oz', NULL, 'Vanilla Syrup', 15),
  ('Vanilla Latte', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Vanilla Latte', '12 oz', NULL, 'Lids', 1),
  ('Vanilla Latte', '16 oz', NULL, 'Espresso Shot', 2),
  ('Vanilla Latte', '16 oz', NULL, 'Fresh Milk', 240),
  ('Vanilla Latte', '16 oz', NULL, 'Vanilla Syrup', 20),
  ('Vanilla Latte', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Vanilla Latte', '16 oz', NULL, 'Lids', 1),
  ('Vanilla Latte', '16 oz', 'cold', 'Straws', 1),
  ('Vanilla Latte', '22 oz', NULL, 'Espresso Shot', 3),
  ('Vanilla Latte', '22 oz', NULL, 'Fresh Milk', 340),
  ('Vanilla Latte', '22 oz', NULL, 'Vanilla Syrup', 30),
  ('Vanilla Latte', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Vanilla Latte', '22 oz', NULL, 'Lids', 1),
  ('Vanilla Latte', '22 oz', 'cold', 'Straws', 1),
  ('Marocchino', '12 oz', NULL, 'Espresso Shot', 2),
  ('Marocchino', '12 oz', NULL, 'Fresh Milk', 120),
  ('Marocchino', '12 oz', NULL, 'Chocolate Sauce', 20),
  ('Marocchino', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Marocchino', '12 oz', NULL, 'Lids', 1),
  ('Marocchino', '16 oz', NULL, 'Espresso Shot', 2),
  ('Marocchino', '16 oz', NULL, 'Fresh Milk', 144),
  ('Marocchino', '16 oz', NULL, 'Chocolate Sauce', 25),
  ('Marocchino', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Marocchino', '16 oz', NULL, 'Lids', 1),
  ('Marocchino', '16 oz', 'cold', 'Straws', 1),
  ('Marocchino', '22 oz', NULL, 'Espresso Shot', 3),
  ('Marocchino', '22 oz', NULL, 'Fresh Milk', 204),
  ('Marocchino', '22 oz', NULL, 'Chocolate Sauce', 35),
  ('Marocchino', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Marocchino', '22 oz', NULL, 'Lids', 1),
  ('Marocchino', '22 oz', 'cold', 'Straws', 1),
  ('Tropical Brew Houze', '12 oz', NULL, 'Espresso Shot', 2),
  ('Tropical Brew Houze', '12 oz', NULL, 'Peach Mango Syrup', 22),
  ('Tropical Brew Houze', '12 oz', NULL, 'Soda Water', 160),
  ('Tropical Brew Houze', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Tropical Brew Houze', '12 oz', NULL, 'Lids', 1),
  ('Tropical Brew Houze', '16 oz', NULL, 'Espresso Shot', 2),
  ('Tropical Brew Houze', '16 oz', NULL, 'Peach Mango Syrup', 30),
  ('Tropical Brew Houze', '16 oz', NULL, 'Soda Water', 192),
  ('Tropical Brew Houze', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Tropical Brew Houze', '16 oz', NULL, 'Lids', 1),
  ('Tropical Brew Houze', '16 oz', 'cold', 'Straws', 1),
  ('Tropical Brew Houze', '22 oz', NULL, 'Espresso Shot', 3),
  ('Tropical Brew Houze', '22 oz', NULL, 'Peach Mango Syrup', 45),
  ('Tropical Brew Houze', '22 oz', NULL, 'Soda Water', 272),
  ('Tropical Brew Houze', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Tropical Brew Houze', '22 oz', NULL, 'Lids', 1),
  ('Tropical Brew Houze', '22 oz', 'cold', 'Straws', 1),
  ('Caramel Macchiato', '12 oz', NULL, 'Espresso Shot', 2),
  ('Caramel Macchiato', '12 oz', NULL, 'Fresh Milk', 200),
  ('Caramel Macchiato', '12 oz', NULL, 'Vanilla Syrup', 10),
  ('Caramel Macchiato', '12 oz', NULL, 'Caramel Sauce', 20),
  ('Caramel Macchiato', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Caramel Macchiato', '12 oz', NULL, 'Lids', 1),
  ('Caramel Macchiato', '16 oz', NULL, 'Espresso Shot', 2),
  ('Caramel Macchiato', '16 oz', NULL, 'Fresh Milk', 240),
  ('Caramel Macchiato', '16 oz', NULL, 'Vanilla Syrup', 14),
  ('Caramel Macchiato', '16 oz', NULL, 'Caramel Sauce', 25),
  ('Caramel Macchiato', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Caramel Macchiato', '16 oz', NULL, 'Lids', 1),
  ('Caramel Macchiato', '16 oz', 'cold', 'Straws', 1),
  ('Caramel Macchiato', '22 oz', NULL, 'Espresso Shot', 3),
  ('Caramel Macchiato', '22 oz', NULL, 'Fresh Milk', 340),
  ('Caramel Macchiato', '22 oz', NULL, 'Vanilla Syrup', 21),
  ('Caramel Macchiato', '22 oz', NULL, 'Caramel Sauce', 35),
  ('Caramel Macchiato', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Caramel Macchiato', '22 oz', NULL, 'Lids', 1),
  ('Caramel Macchiato', '22 oz', 'cold', 'Straws', 1),
  ('Winter Brew Houze', '12 oz', NULL, 'Espresso Shot', 2),
  ('Winter Brew Houze', '12 oz', NULL, 'Fresh Milk', 200),
  ('Winter Brew Houze', '12 oz', NULL, 'White Chocolate Sauce', 20),
  ('Winter Brew Houze', '12 oz', NULL, 'Whipping Cream', 20),
  ('Winter Brew Houze', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Winter Brew Houze', '12 oz', NULL, 'Lids', 1),
  ('Winter Brew Houze', '16 oz', NULL, 'Espresso Shot', 2),
  ('Winter Brew Houze', '16 oz', NULL, 'Fresh Milk', 240),
  ('Winter Brew Houze', '16 oz', NULL, 'White Chocolate Sauce', 25),
  ('Winter Brew Houze', '16 oz', NULL, 'Whipping Cream', 25),
  ('Winter Brew Houze', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Winter Brew Houze', '16 oz', NULL, 'Lids', 1),
  ('Winter Brew Houze', '16 oz', 'cold', 'Straws', 1),
  ('Winter Brew Houze', '22 oz', NULL, 'Espresso Shot', 3),
  ('Winter Brew Houze', '22 oz', NULL, 'Fresh Milk', 340),
  ('Winter Brew Houze', '22 oz', NULL, 'White Chocolate Sauce', 35),
  ('Winter Brew Houze', '22 oz', NULL, 'Whipping Cream', 30),
  ('Winter Brew Houze', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Winter Brew Houze', '22 oz', NULL, 'Lids', 1),
  ('Winter Brew Houze', '22 oz', 'cold', 'Straws', 1),
  ('Caramel Matcha', '12 oz', NULL, 'Matcha Powder', 4),
  ('Caramel Matcha', '12 oz', NULL, 'Fresh Milk', 200),
  ('Caramel Matcha', '12 oz', NULL, 'Caramel Sauce', 20),
  ('Caramel Matcha', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Caramel Matcha', '12 oz', NULL, 'Lids', 1),
  ('Caramel Matcha', '16 oz', NULL, 'Matcha Powder', 5),
  ('Caramel Matcha', '16 oz', NULL, 'Fresh Milk', 240),
  ('Caramel Matcha', '16 oz', NULL, 'Caramel Sauce', 25),
  ('Caramel Matcha', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Caramel Matcha', '16 oz', NULL, 'Lids', 1),
  ('Caramel Matcha', '16 oz', 'cold', 'Straws', 1),
  ('Caramel Matcha', '22 oz', NULL, 'Matcha Powder', 7),
  ('Caramel Matcha', '22 oz', NULL, 'Fresh Milk', 340),
  ('Caramel Matcha', '22 oz', NULL, 'Caramel Sauce', 35),
  ('Caramel Matcha', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Caramel Matcha', '22 oz', NULL, 'Lids', 1),
  ('Caramel Matcha', '22 oz', 'cold', 'Straws', 1),
  ('Strawberry Matcha', '12 oz', NULL, 'Matcha Powder', 4),
  ('Strawberry Matcha', '12 oz', NULL, 'Fresh Milk', 200),
  ('Strawberry Matcha', '12 oz', NULL, 'Strawberry Syrup', 22),
  ('Strawberry Matcha', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Strawberry Matcha', '12 oz', NULL, 'Lids', 1),
  ('Strawberry Matcha', '16 oz', NULL, 'Matcha Powder', 5),
  ('Strawberry Matcha', '16 oz', NULL, 'Fresh Milk', 240),
  ('Strawberry Matcha', '16 oz', NULL, 'Strawberry Syrup', 30),
  ('Strawberry Matcha', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Strawberry Matcha', '16 oz', NULL, 'Lids', 1),
  ('Strawberry Matcha', '16 oz', 'cold', 'Straws', 1),
  ('Strawberry Matcha', '22 oz', NULL, 'Matcha Powder', 7),
  ('Strawberry Matcha', '22 oz', NULL, 'Fresh Milk', 340),
  ('Strawberry Matcha', '22 oz', NULL, 'Strawberry Syrup', 45),
  ('Strawberry Matcha', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Strawberry Matcha', '22 oz', NULL, 'Lids', 1),
  ('Strawberry Matcha', '22 oz', 'cold', 'Straws', 1),
  ('Mocha', '12 oz', NULL, 'Espresso Shot', 2),
  ('Mocha', '12 oz', NULL, 'Fresh Milk', 200),
  ('Mocha', '12 oz', NULL, 'Chocolate Sauce', 20),
  ('Mocha', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Mocha', '12 oz', NULL, 'Lids', 1),
  ('Mocha', '16 oz', NULL, 'Espresso Shot', 2),
  ('Mocha', '16 oz', NULL, 'Fresh Milk', 240),
  ('Mocha', '16 oz', NULL, 'Chocolate Sauce', 25),
  ('Mocha', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Mocha', '16 oz', NULL, 'Lids', 1),
  ('Mocha', '16 oz', 'cold', 'Straws', 1),
  ('Mocha', '22 oz', NULL, 'Espresso Shot', 3),
  ('Mocha', '22 oz', NULL, 'Fresh Milk', 340),
  ('Mocha', '22 oz', NULL, 'Chocolate Sauce', 35),
  ('Mocha', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Mocha', '22 oz', NULL, 'Lids', 1),
  ('Mocha', '22 oz', 'cold', 'Straws', 1),
  ('Hazelnut Latte', '12 oz', NULL, 'Espresso Shot', 2),
  ('Hazelnut Latte', '12 oz', NULL, 'Fresh Milk', 200),
  ('Hazelnut Latte', '12 oz', NULL, 'Hazelnut Syrup', 15),
  ('Hazelnut Latte', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Hazelnut Latte', '12 oz', NULL, 'Lids', 1),
  ('Hazelnut Latte', '16 oz', NULL, 'Espresso Shot', 2),
  ('Hazelnut Latte', '16 oz', NULL, 'Fresh Milk', 240),
  ('Hazelnut Latte', '16 oz', NULL, 'Hazelnut Syrup', 20),
  ('Hazelnut Latte', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Hazelnut Latte', '16 oz', NULL, 'Lids', 1),
  ('Hazelnut Latte', '16 oz', 'cold', 'Straws', 1),
  ('Hazelnut Latte', '22 oz', NULL, 'Espresso Shot', 3),
  ('Hazelnut Latte', '22 oz', NULL, 'Fresh Milk', 340),
  ('Hazelnut Latte', '22 oz', NULL, 'Hazelnut Syrup', 30),
  ('Hazelnut Latte', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Hazelnut Latte', '22 oz', NULL, 'Lids', 1),
  ('Hazelnut Latte', '22 oz', 'cold', 'Straws', 1),
  ('Vanilla Hazelnut', '12 oz', NULL, 'Espresso Shot', 2),
  ('Vanilla Hazelnut', '12 oz', NULL, 'Fresh Milk', 200),
  ('Vanilla Hazelnut', '12 oz', NULL, 'Vanilla Syrup', 8),
  ('Vanilla Hazelnut', '12 oz', NULL, 'Hazelnut Syrup', 8),
  ('Vanilla Hazelnut', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Vanilla Hazelnut', '12 oz', NULL, 'Lids', 1),
  ('Vanilla Hazelnut', '16 oz', NULL, 'Espresso Shot', 2),
  ('Vanilla Hazelnut', '16 oz', NULL, 'Fresh Milk', 240),
  ('Vanilla Hazelnut', '16 oz', NULL, 'Vanilla Syrup', 10),
  ('Vanilla Hazelnut', '16 oz', NULL, 'Hazelnut Syrup', 10),
  ('Vanilla Hazelnut', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Vanilla Hazelnut', '16 oz', NULL, 'Lids', 1),
  ('Vanilla Hazelnut', '16 oz', 'cold', 'Straws', 1),
  ('Vanilla Hazelnut', '22 oz', NULL, 'Espresso Shot', 3),
  ('Vanilla Hazelnut', '22 oz', NULL, 'Fresh Milk', 340),
  ('Vanilla Hazelnut', '22 oz', NULL, 'Vanilla Syrup', 15),
  ('Vanilla Hazelnut', '22 oz', NULL, 'Hazelnut Syrup', 15),
  ('Vanilla Hazelnut', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Vanilla Hazelnut', '22 oz', NULL, 'Lids', 1),
  ('Vanilla Hazelnut', '22 oz', 'cold', 'Straws', 1),
  ('Salted Caramel', '12 oz', NULL, 'Espresso Shot', 2),
  ('Salted Caramel', '12 oz', NULL, 'Fresh Milk', 200),
  ('Salted Caramel', '12 oz', NULL, 'Salted Caramel Syrup', 15),
  ('Salted Caramel', '12 oz', NULL, 'Cups 12 oz', 1),
  ('Salted Caramel', '12 oz', NULL, 'Lids', 1),
  ('Salted Caramel', '16 oz', NULL, 'Espresso Shot', 2),
  ('Salted Caramel', '16 oz', NULL, 'Fresh Milk', 240),
  ('Salted Caramel', '16 oz', NULL, 'Salted Caramel Syrup', 20),
  ('Salted Caramel', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Salted Caramel', '16 oz', NULL, 'Lids', 1),
  ('Salted Caramel', '16 oz', 'cold', 'Straws', 1),
  ('Salted Caramel', '22 oz', NULL, 'Espresso Shot', 3),
  ('Salted Caramel', '22 oz', NULL, 'Fresh Milk', 340),
  ('Salted Caramel', '22 oz', NULL, 'Salted Caramel Syrup', 30),
  ('Salted Caramel', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Salted Caramel', '22 oz', NULL, 'Lids', 1),
  ('Salted Caramel', '22 oz', 'cold', 'Straws', 1),
  ('Thai Strawberry Espresso', '16 oz', NULL, 'Espresso Shot', 2),
  ('Thai Strawberry Espresso', '16 oz', NULL, 'Strawberry Syrup', 30),
  ('Thai Strawberry Espresso', '16 oz', NULL, 'Condensed Milk', 25),
  ('Thai Strawberry Espresso', '16 oz', NULL, 'Fresh Milk', 168),
  ('Thai Strawberry Espresso', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Thai Strawberry Espresso', '16 oz', NULL, 'Lids', 1),
  ('Thai Strawberry Espresso', '16 oz', 'cold', 'Straws', 1),
  ('Thai Strawberry Espresso', '22 oz', NULL, 'Espresso Shot', 3),
  ('Thai Strawberry Espresso', '22 oz', NULL, 'Strawberry Syrup', 45),
  ('Thai Strawberry Espresso', '22 oz', NULL, 'Condensed Milk', 35),
  ('Thai Strawberry Espresso', '22 oz', NULL, 'Fresh Milk', 238),
  ('Thai Strawberry Espresso', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Thai Strawberry Espresso', '22 oz', NULL, 'Lids', 1),
  ('Thai Strawberry Espresso', '22 oz', 'cold', 'Straws', 1),
  ('Almond Milk Espresso', '16 oz', NULL, 'Espresso Shot', 2),
  ('Almond Milk Espresso', '16 oz', NULL, 'Almond Milk', 240),
  ('Almond Milk Espresso', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Almond Milk Espresso', '16 oz', NULL, 'Lids', 1),
  ('Almond Milk Espresso', '16 oz', 'cold', 'Straws', 1),
  ('Almond Milk Espresso', '22 oz', NULL, 'Espresso Shot', 3),
  ('Almond Milk Espresso', '22 oz', NULL, 'Almond Milk', 340),
  ('Almond Milk Espresso', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Almond Milk Espresso', '22 oz', NULL, 'Lids', 1),
  ('Almond Milk Espresso', '22 oz', 'cold', 'Straws', 1),
  ('Affogato', 'Regular', NULL, 'Espresso Shot', 2),
  ('Affogato', 'Regular', NULL, 'Fior di Latte Gelato', 120),
  ('Affogato', 'Regular', NULL, 'Cups 8 oz', 1),
  ('Cappuccino Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Cappuccino Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Cappuccino Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Cappuccino Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Cappuccino Frappe', '16 oz', NULL, 'Lids', 1),
  ('Cappuccino Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Cappuccino Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Cappuccino Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Cappuccino Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Cappuccino Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Cappuccino Frappe', '22 oz', NULL, 'Lids', 1),
  ('Cappuccino Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Latte Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Latte Frappe', '16 oz', NULL, 'Fresh Milk', 165),
  ('Latte Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Latte Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Latte Frappe', '16 oz', NULL, 'Lids', 1),
  ('Latte Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Latte Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Latte Frappe', '22 oz', NULL, 'Fresh Milk', 220),
  ('Latte Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Latte Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Latte Frappe', '22 oz', NULL, 'Lids', 1),
  ('Latte Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Salted Caramel Latte Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Salted Caramel Latte Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Salted Caramel Latte Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Salted Caramel Latte Frappe', '16 oz', NULL, 'Salted Caramel Syrup', 20),
  ('Salted Caramel Latte Frappe', '16 oz', NULL, 'Whipping Cream', 20),
  ('Salted Caramel Latte Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Salted Caramel Latte Frappe', '16 oz', NULL, 'Lids', 1),
  ('Salted Caramel Latte Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Salted Caramel Latte Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Salted Caramel Latte Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Salted Caramel Latte Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Salted Caramel Latte Frappe', '22 oz', NULL, 'Salted Caramel Syrup', 30),
  ('Salted Caramel Latte Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('Salted Caramel Latte Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Salted Caramel Latte Frappe', '22 oz', NULL, 'Lids', 1),
  ('Salted Caramel Latte Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Espresso Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Espresso Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Espresso Frappe', '16 oz', NULL, 'Espresso Shot', 2),
  ('Espresso Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Espresso Frappe', '16 oz', NULL, 'Lids', 1),
  ('Espresso Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Espresso Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Espresso Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Espresso Frappe', '22 oz', NULL, 'Espresso Shot', 3),
  ('Espresso Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Espresso Frappe', '22 oz', NULL, 'Lids', 1),
  ('Espresso Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Mocha Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Mocha Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Mocha Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Mocha Frappe', '16 oz', NULL, 'Chocolate Sauce', 25),
  ('Mocha Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Mocha Frappe', '16 oz', NULL, 'Lids', 1),
  ('Mocha Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Mocha Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Mocha Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Mocha Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Mocha Frappe', '22 oz', NULL, 'Chocolate Sauce', 35),
  ('Mocha Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Mocha Frappe', '22 oz', NULL, 'Lids', 1),
  ('Mocha Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Vanilla Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Vanilla Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Vanilla Frappe', '16 oz', NULL, 'Vanilla Syrup', 20),
  ('Vanilla Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Vanilla Frappe', '16 oz', NULL, 'Lids', 1),
  ('Vanilla Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Vanilla Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Vanilla Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Vanilla Frappe', '22 oz', NULL, 'Vanilla Syrup', 30),
  ('Vanilla Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Vanilla Frappe', '22 oz', NULL, 'Lids', 1),
  ('Vanilla Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Chocolate Caramel Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Chocolate Caramel Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Chocolate Caramel Frappe', '16 oz', NULL, 'Chocolate Sauce', 25),
  ('Chocolate Caramel Frappe', '16 oz', NULL, 'Caramel Sauce', 15),
  ('Chocolate Caramel Frappe', '16 oz', NULL, 'Whipping Cream', 20),
  ('Chocolate Caramel Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Chocolate Caramel Frappe', '16 oz', NULL, 'Lids', 1),
  ('Chocolate Caramel Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Chocolate Caramel Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Chocolate Caramel Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Chocolate Caramel Frappe', '22 oz', NULL, 'Chocolate Sauce', 35),
  ('Chocolate Caramel Frappe', '22 oz', NULL, 'Caramel Sauce', 20),
  ('Chocolate Caramel Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('Chocolate Caramel Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Chocolate Caramel Frappe', '22 oz', NULL, 'Lids', 1),
  ('Chocolate Caramel Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Java Chip Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Java Chip Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Java Chip Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Java Chip Frappe', '16 oz', NULL, 'Chocolate Sauce', 20),
  ('Java Chip Frappe', '16 oz', NULL, 'Java Chips', 15),
  ('Java Chip Frappe', '16 oz', NULL, 'Whipping Cream', 20),
  ('Java Chip Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Java Chip Frappe', '16 oz', NULL, 'Lids', 1),
  ('Java Chip Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Java Chip Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Java Chip Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Java Chip Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Java Chip Frappe', '22 oz', NULL, 'Chocolate Sauce', 30),
  ('Java Chip Frappe', '22 oz', NULL, 'Java Chips', 20),
  ('Java Chip Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('Java Chip Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Java Chip Frappe', '22 oz', NULL, 'Lids', 1),
  ('Java Chip Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Vanilla Syrup', 10),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Hazelnut Syrup', 10),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Crushed Oreo', 15),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Whipping Cream', 20),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', NULL, 'Lids', 1),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Vanilla Syrup', 15),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Hazelnut Syrup', 15),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Crushed Oreo', 20),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', NULL, 'Lids', 1),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Strawberry Choco Espresso Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Strawberry Choco Espresso Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Strawberry Choco Espresso Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Strawberry Choco Espresso Frappe', '16 oz', NULL, 'Strawberry Syrup', 20),
  ('Strawberry Choco Espresso Frappe', '16 oz', NULL, 'Chocolate Sauce', 15),
  ('Strawberry Choco Espresso Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Strawberry Choco Espresso Frappe', '16 oz', NULL, 'Lids', 1),
  ('Strawberry Choco Espresso Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Strawberry Choco Espresso Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Strawberry Choco Espresso Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Strawberry Choco Espresso Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Strawberry Choco Espresso Frappe', '22 oz', NULL, 'Strawberry Syrup', 30),
  ('Strawberry Choco Espresso Frappe', '22 oz', NULL, 'Chocolate Sauce', 20),
  ('Strawberry Choco Espresso Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Strawberry Choco Espresso Frappe', '22 oz', NULL, 'Lids', 1),
  ('Strawberry Choco Espresso Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Summer Brew Houze Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Summer Brew Houze Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Summer Brew Houze Frappe', '16 oz', NULL, 'Peach Mango Syrup', 25),
  ('Summer Brew Houze Frappe', '16 oz', NULL, 'Passion Fruit Syrup', 10),
  ('Summer Brew Houze Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Summer Brew Houze Frappe', '16 oz', NULL, 'Lids', 1),
  ('Summer Brew Houze Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Summer Brew Houze Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Summer Brew Houze Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Summer Brew Houze Frappe', '22 oz', NULL, 'Peach Mango Syrup', 35),
  ('Summer Brew Houze Frappe', '22 oz', NULL, 'Passion Fruit Syrup', 15),
  ('Summer Brew Houze Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Summer Brew Houze Frappe', '22 oz', NULL, 'Lids', 1),
  ('Summer Brew Houze Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Matcha Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Matcha Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Matcha Frappe', '16 oz', NULL, 'Matcha Powder', 5),
  ('Matcha Frappe', '16 oz', NULL, 'Whipping Cream', 20),
  ('Matcha Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Matcha Frappe', '16 oz', NULL, 'Lids', 1),
  ('Matcha Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Matcha Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Matcha Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Matcha Frappe', '22 oz', NULL, 'Matcha Powder', 7),
  ('Matcha Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('Matcha Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Matcha Frappe', '22 oz', NULL, 'Lids', 1),
  ('Matcha Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Frappe Base Powder', 30),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Fresh Milk', 150),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Espresso Shot', 1),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Cream Cheese', 20),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Chocolate Sauce', 10),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Whipping Cream', 20),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Cheesecake Tiramisu Frappe', '16 oz', NULL, 'Lids', 1),
  ('Cheesecake Tiramisu Frappe', '16 oz', 'cold', 'Straws', 1),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Cream Cheese', 30),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Chocolate Sauce', 15),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Cheesecake Tiramisu Frappe', '22 oz', NULL, 'Lids', 1),
  ('Cheesecake Tiramisu Frappe', '22 oz', 'cold', 'Straws', 1),
  ('White Winter Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('White Winter Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('White Winter Frappe', '22 oz', NULL, 'Espresso Shot', 2),
  ('White Winter Frappe', '22 oz', NULL, 'White Chocolate Sauce', 35),
  ('White Winter Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('White Winter Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('White Winter Frappe', '22 oz', NULL, 'Lids', 1),
  ('White Winter Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Fior di Latte Frappe', '22 oz', NULL, 'Frappe Base Powder', 40),
  ('Fior di Latte Frappe', '22 oz', NULL, 'Fresh Milk', 200),
  ('Fior di Latte Frappe', '22 oz', NULL, 'Fior di Latte Gelato', 120),
  ('Fior di Latte Frappe', '22 oz', NULL, 'Whipping Cream', 30),
  ('Fior di Latte Frappe', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Fior di Latte Frappe', '22 oz', NULL, 'Lids', 1),
  ('Fior di Latte Frappe', '22 oz', 'cold', 'Straws', 1),
  ('Honey Blend Iced Tea', '16 oz', NULL, 'Black Tea Leaves', 4),
  ('Honey Blend Iced Tea', '16 oz', NULL, 'Honey', 20),
  ('Honey Blend Iced Tea', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Honey Blend Iced Tea', '16 oz', NULL, 'Lids', 1),
  ('Honey Blend Iced Tea', '16 oz', 'cold', 'Straws', 1),
  ('Honey Blend Iced Tea', '22 oz', NULL, 'Black Tea Leaves', 6),
  ('Honey Blend Iced Tea', '22 oz', NULL, 'Honey', 30),
  ('Honey Blend Iced Tea', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Honey Blend Iced Tea', '22 oz', NULL, 'Lids', 1),
  ('Honey Blend Iced Tea', '22 oz', 'cold', 'Straws', 1),
  ('Vanilla Fruity Iced Tea', '16 oz', NULL, 'Black Tea Leaves', 4),
  ('Vanilla Fruity Iced Tea', '16 oz', NULL, 'Vanilla Syrup', 10),
  ('Vanilla Fruity Iced Tea', '16 oz', NULL, 'Strawberry Syrup', 15),
  ('Vanilla Fruity Iced Tea', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Vanilla Fruity Iced Tea', '16 oz', NULL, 'Lids', 1),
  ('Vanilla Fruity Iced Tea', '16 oz', 'cold', 'Straws', 1),
  ('Vanilla Fruity Iced Tea', '22 oz', NULL, 'Black Tea Leaves', 6),
  ('Vanilla Fruity Iced Tea', '22 oz', NULL, 'Vanilla Syrup', 15),
  ('Vanilla Fruity Iced Tea', '22 oz', NULL, 'Strawberry Syrup', 20),
  ('Vanilla Fruity Iced Tea', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Vanilla Fruity Iced Tea', '22 oz', NULL, 'Lids', 1),
  ('Vanilla Fruity Iced Tea', '22 oz', 'cold', 'Straws', 1),
  ('Peach Mango Iced Tea', '16 oz', NULL, 'Black Tea Leaves', 4),
  ('Peach Mango Iced Tea', '16 oz', NULL, 'Peach Mango Syrup', 25),
  ('Peach Mango Iced Tea', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Peach Mango Iced Tea', '16 oz', NULL, 'Lids', 1),
  ('Peach Mango Iced Tea', '16 oz', 'cold', 'Straws', 1),
  ('Peach Mango Iced Tea', '22 oz', NULL, 'Black Tea Leaves', 6),
  ('Peach Mango Iced Tea', '22 oz', NULL, 'Peach Mango Syrup', 35),
  ('Peach Mango Iced Tea', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Peach Mango Iced Tea', '22 oz', NULL, 'Lids', 1),
  ('Peach Mango Iced Tea', '22 oz', 'cold', 'Straws', 1),
  ('Lemon Mojito', '16 oz', NULL, 'Lemon Juice', 20),
  ('Lemon Mojito', '16 oz', NULL, 'Mint Leaves', 3),
  ('Lemon Mojito', '16 oz', NULL, 'Soda Water', 200),
  ('Lemon Mojito', '16 oz', NULL, 'Sugar Syrup', 20),
  ('Lemon Mojito', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Lemon Mojito', '16 oz', NULL, 'Lids', 1),
  ('Lemon Mojito', '16 oz', 'cold', 'Straws', 1),
  ('Lemon Mojito', '22 oz', NULL, 'Lemon Juice', 30),
  ('Lemon Mojito', '22 oz', NULL, 'Mint Leaves', 4),
  ('Lemon Mojito', '22 oz', NULL, 'Soda Water', 280),
  ('Lemon Mojito', '22 oz', NULL, 'Sugar Syrup', 30),
  ('Lemon Mojito', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Lemon Mojito', '22 oz', NULL, 'Lids', 1),
  ('Lemon Mojito', '22 oz', 'cold', 'Straws', 1),
  ('Strawberry Mojito', '16 oz', NULL, 'Lemon Juice', 20),
  ('Strawberry Mojito', '16 oz', NULL, 'Mint Leaves', 3),
  ('Strawberry Mojito', '16 oz', NULL, 'Soda Water', 200),
  ('Strawberry Mojito', '16 oz', NULL, 'Strawberry Syrup', 25),
  ('Strawberry Mojito', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Strawberry Mojito', '16 oz', NULL, 'Lids', 1),
  ('Strawberry Mojito', '16 oz', 'cold', 'Straws', 1),
  ('Strawberry Mojito', '22 oz', NULL, 'Lemon Juice', 30),
  ('Strawberry Mojito', '22 oz', NULL, 'Mint Leaves', 4),
  ('Strawberry Mojito', '22 oz', NULL, 'Soda Water', 280),
  ('Strawberry Mojito', '22 oz', NULL, 'Strawberry Syrup', 35),
  ('Strawberry Mojito', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Strawberry Mojito', '22 oz', NULL, 'Lids', 1),
  ('Strawberry Mojito', '22 oz', 'cold', 'Straws', 1),
  ('Passion Fruit Mojito', '16 oz', NULL, 'Lemon Juice', 20),
  ('Passion Fruit Mojito', '16 oz', NULL, 'Mint Leaves', 3),
  ('Passion Fruit Mojito', '16 oz', NULL, 'Soda Water', 200),
  ('Passion Fruit Mojito', '16 oz', NULL, 'Passion Fruit Syrup', 25),
  ('Passion Fruit Mojito', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Passion Fruit Mojito', '16 oz', NULL, 'Lids', 1),
  ('Passion Fruit Mojito', '16 oz', 'cold', 'Straws', 1),
  ('Passion Fruit Mojito', '22 oz', NULL, 'Lemon Juice', 30),
  ('Passion Fruit Mojito', '22 oz', NULL, 'Mint Leaves', 4),
  ('Passion Fruit Mojito', '22 oz', NULL, 'Soda Water', 280),
  ('Passion Fruit Mojito', '22 oz', NULL, 'Passion Fruit Syrup', 35),
  ('Passion Fruit Mojito', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Passion Fruit Mojito', '22 oz', NULL, 'Lids', 1),
  ('Passion Fruit Mojito', '22 oz', 'cold', 'Straws', 1),
  ('Blueberry Mojito', '16 oz', NULL, 'Lemon Juice', 20),
  ('Blueberry Mojito', '16 oz', NULL, 'Mint Leaves', 3),
  ('Blueberry Mojito', '16 oz', NULL, 'Soda Water', 200),
  ('Blueberry Mojito', '16 oz', NULL, 'Blueberry Syrup', 25),
  ('Blueberry Mojito', '16 oz', NULL, 'Cups 16 oz', 1),
  ('Blueberry Mojito', '16 oz', NULL, 'Lids', 1),
  ('Blueberry Mojito', '16 oz', 'cold', 'Straws', 1),
  ('Blueberry Mojito', '22 oz', NULL, 'Lemon Juice', 30),
  ('Blueberry Mojito', '22 oz', NULL, 'Mint Leaves', 4),
  ('Blueberry Mojito', '22 oz', NULL, 'Soda Water', 280),
  ('Blueberry Mojito', '22 oz', NULL, 'Blueberry Syrup', 35),
  ('Blueberry Mojito', '22 oz', NULL, 'Cups 22 oz', 1),
  ('Blueberry Mojito', '22 oz', NULL, 'Lids', 1),
  ('Blueberry Mojito', '22 oz', 'cold', 'Straws', 1);

-- Existing drinks: clear their old recipes once, while they are still in the old categories
DELETE FROM variant_ingredients vi
USING product_variants pv, products p, seed_products s
WHERE vi.product_variant_id = pv.product_variant_id
  AND pv.product_id = p.product_id
  AND p.product_name = s.old_name
  AND p.product_category IN ('Espresso Based', 'Non-Coffee')
  AND p.is_archived = FALSE;

-- Existing drinks: new names, categories and descriptions
UPDATE products p
SET product_name = s.product_name, product_category = s.category, product_description = s.description, updated_at = CURRENT_TIMESTAMP
FROM seed_products s
WHERE p.product_name = s.old_name
  AND p.product_category IN ('Espresso Based', 'Non-Coffee')
  AND p.is_archived = FALSE;

-- New drinks
INSERT INTO products (product_name, product_description, product_category, product_type, station, price)
SELECT s.product_name, s.description, s.category, 'recipe', 'bar', (SELECT MIN(v.price) FROM seed_variants v WHERE v.product_name = s.product_name)
FROM seed_products s
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.product_name = s.product_name AND p.is_archived = FALSE);

-- Sizes: add the missing ones
INSERT INTO product_variants (product_id, size_label, temperature, price)
SELECT p.product_id, v.size_label, v.temperature, v.price
FROM seed_variants v
JOIN products p ON p.product_name = v.product_name AND p.is_archived = FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM product_variants pv
  WHERE pv.product_id = p.product_id
    AND LOWER(TRIM(pv.size_label)) = LOWER(v.size_label)
    AND pv.temperature IS NOT DISTINCT FROM v.temperature
);

-- Sizes: menu prices, and bring back any that were archived
UPDATE product_variants pv
SET price = v.price, is_archived = FALSE, archived_at = NULL, archived_by = NULL, updated_at = CURRENT_TIMESTAMP
FROM seed_variants v
JOIN products p ON p.product_name = v.product_name AND p.is_archived = FALSE
WHERE pv.product_id = p.product_id
  AND LOWER(TRIM(pv.size_label)) = LOWER(v.size_label)
  AND pv.temperature IS NOT DISTINCT FROM v.temperature
  AND (pv.price IS DISTINCT FROM v.price OR pv.is_archived);

-- Sizes not on the menu are archived (kept for past orders)
UPDATE product_variants pv
SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
FROM products p
JOIN seed_products s ON s.product_name = p.product_name
WHERE pv.product_id = p.product_id
  AND p.is_archived = FALSE
  AND pv.is_archived = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM seed_variants v
    WHERE v.product_name = p.product_name
      AND LOWER(v.size_label) = LOWER(TRIM(pv.size_label))
      AND v.temperature IS NOT DISTINCT FROM pv.temperature
  );

-- Recipes, only for sizes that have none yet
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT pv.product_variant_id, inv.inventory_id, r.qty
FROM seed_recipes r
JOIN products p ON p.product_name = r.product_name AND p.is_archived = FALSE
JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE
  AND LOWER(TRIM(pv.size_label)) = LOWER(r.size_label)
  AND (r.temperature IS NULL OR pv.temperature = r.temperature)
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE
WHERE NOT EXISTS (SELECT 1 FROM variant_ingredients vi WHERE vi.product_variant_id = pv.product_variant_id);

-- Each drink shows its lowest price
UPDATE products p
SET price = (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_archived = FALSE)
FROM seed_products s
WHERE p.product_name = s.product_name AND p.is_archived = FALSE;

-- Old categories off once nothing uses them
UPDATE product_categories c
SET is_active = FALSE
WHERE c.category_name IN ('Espresso Based', 'Non-Coffee')
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.product_category = c.category_name AND p.is_archived = FALSE);

COMMIT;
