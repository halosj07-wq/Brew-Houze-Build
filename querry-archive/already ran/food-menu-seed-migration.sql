-- Food menu seed: the official Brew Houze food menu (kitchen items)
--
-- Adds the food menu with its printed prices. Every dish is made in the kitchen, so it goes to
-- the kitchen queue.
--   8 categories: Pizza, Sandwiches, Pasta, Wings, Sushi, Snacks, Rice Meals, Sizzling
--   45 dishes. Sizzling dishes that the menu lists both with rice and ala carte are one
--   dish with two options (With Rice, Ala Carte), each at its printed price.
--   59 kitchen inventory items, each logged in stock history as created, with a
--   package and pack price so costs work.
--
-- Recipes and ingredient costs are estimates (the menu does not print them). Adjust them in
-- Menu and Inventory. Not added: Pizza Burger, Salt and Pepper Wings, Crabmeat Tempura and the
-- sushi plus honey blend iced tea deal. The drinks, Bottled Water and the cookie are not touched.
--
-- Run in the Supabase SQL editor. It does not need menu-seed-migration.sql. Safe to run again:
-- nothing is added twice, and dishes that already have a recipe keep it.

BEGIN;

-- Categories
INSERT INTO product_categories (category_name, is_active) VALUES
  ('Pizza', TRUE),
  ('Sandwiches', TRUE),
  ('Pasta', TRUE),
  ('Wings', TRUE),
  ('Sushi', TRUE),
  ('Snacks', TRUE),
  ('Rice Meals', TRUE),
  ('Sizzling', TRUE)
ON CONFLICT (category_name) DO UPDATE SET is_active = TRUE;

-- Kitchen inventory, each with its package and a created entry in stock history
WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Pizza Dough', 'Pieces', 30, 5, TRUE, 25.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pizza Dough' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 10', NULL, 10, 250, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Pizza Sauce', 'mL', 2000, 300, FALSE, 0.15
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pizza Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L jar', NULL, 1000, 150, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dairy', 'Mozzarella', 'grams', 3000, 500, FALSE, 0.55
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Mozzarella' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg block', NULL, 1000, 550, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dairy', 'Cheddar Cheese', 'grams', 2000, 300, FALSE, 0.45
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cheddar Cheese' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg block', NULL, 1000, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dairy', 'Parmesan', 'grams', 500, 100, FALSE, 1.5
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Parmesan' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '250 g pack', NULL, 250, 375, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dairy', 'Cheese Slices', 'Pieces', 48, 10, TRUE, 6.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cheese Slices' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 24', NULL, 24, 144, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dairy', 'All-Purpose Cream', 'mL', 1500, 300, FALSE, 0.26
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'All-Purpose Cream' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '250 mL pack', NULL, 250, 65, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 6, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Pepperoni', 'grams', 1000, 200, FALSE, 0.8
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pepperoni' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 g pack', NULL, 500, 400, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Ham', 'grams', 2000, 300, FALSE, 0.45
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Ham' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Prosciutto', 'grams', 500, 100, FALSE, 1.8
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Prosciutto' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '250 g pack', NULL, 250, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Bacon', 'grams', 1000, 200, FALSE, 0.9
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Bacon' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 900, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Ground Beef', 'grams', 3000, 500, FALSE, 0.42
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Ground Beef' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 420, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Chicken Breast', 'grams', 2000, 300, FALSE, 0.3
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Chicken Breast' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 300, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Chicken Wings', 'Pieces', 96, 24, TRUE, 14.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Chicken Wings' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 24', NULL, 24, 336, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 4, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Chicken Leg Quarter', 'Pieces', 20, 4, TRUE, 45.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Chicken Leg Quarter' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 10', NULL, 10, 450, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Beef Tapa', 'grams', 3000, 500, FALSE, 0.55
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Beef Tapa' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 550, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Pork Tocino', 'grams', 3000, 500, FALSE, 0.4
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pork Tocino' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 400, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Pork Liempo', 'grams', 4000, 500, FALSE, 0.38
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pork Liempo' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 380, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 4, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Pork Chop', 'Pieces', 20, 4, TRUE, 55.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pork Chop' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 10', NULL, 10, 550, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Pork Sisig Mix', 'grams', 3000, 500, FALSE, 0.4
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pork Sisig Mix' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 400, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Beef Sirloin', 'grams', 3000, 500, FALSE, 0.7
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Beef Sirloin' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 700, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Burger Patty', 'Pieces', 36, 6, TRUE, 18.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Burger Patty' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 12', NULL, 12, 216, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Hotdog', 'Pieces', 40, 10, TRUE, 8.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Hotdog' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 20', NULL, 20, 160, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Lumpiang Shanghai', 'Pieces', 150, 20, TRUE, 4.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Lumpiang Shanghai' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 50', NULL, 50, 200, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Meat', 'Crabsticks', 'Pieces', 60, 10, TRUE, 5.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Crabsticks' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 20', NULL, 20, 100, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Pineapple Tidbits', 'grams', 1672, 200, FALSE, 0.1998
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pineapple Tidbits' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '836 g can', NULL, 836, 167, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Tomatoes', 'grams', 2000, 300, FALSE, 0.1
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Tomatoes' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg', NULL, 1000, 100, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Onions', 'grams', 3000, 500, FALSE, 0.12
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Onions' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg', NULL, 1000, 120, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Garlic', 'grams', 1000, 200, FALSE, 0.15
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Garlic' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg', NULL, 1000, 150, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Lettuce', 'grams', 1000, 200, FALSE, 0.15
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Lettuce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 g head', NULL, 500, 75, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Cucumber', 'grams', 1000, 200, FALSE, 0.08
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cucumber' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg', NULL, 1000, 80, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Potatoes', 'grams', 5000, 1000, FALSE, 0.09
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Potatoes' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg', NULL, 1000, 90, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 5, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Basil Leaves', 'grams', 100, 30, FALSE, 1.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Basil Leaves' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '100 g pack', NULL, 100, 100, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Button Mushrooms', 'grams', 1200, 200, FALSE, 0.3
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Button Mushrooms' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '400 g can', NULL, 400, 120, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Produce', 'Eggs', 'Pieces', 90, 30, TRUE, 9.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Eggs' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Tray of 30', NULL, 30, 270, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Rice', 'grams', 25000, 3000, FALSE, 0.05
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Rice' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '25 kg sack', NULL, 25000, 1250, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Japanese Rice', 'grams', 5000, 1000, FALSE, 0.12
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Japanese Rice' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '5 kg bag', NULL, 5000, 600, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Spaghetti Noodles', 'grams', 3000, 500, FALSE, 0.15
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Spaghetti Noodles' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 150, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Sandwich Bread', 'Pieces', 60, 10, TRUE, 3.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Sandwich Bread' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Loaf of 20 slices', NULL, 20, 60, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Brioche Bun', 'Pieces', 18, 6, TRUE, 15.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Brioche Bun' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 6', NULL, 6, 90, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Black Burger Bun', 'Pieces', 18, 6, TRUE, 18.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Black Burger Bun' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 6', NULL, 6, 108, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Focaccia Bread', 'Pieces', 24, 6, TRUE, 15.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Focaccia Bread' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Tray of 12', NULL, 12, 180, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Tortilla Wrap', 'Pieces', 20, 6, TRUE, 8.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Tortilla Wrap' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 10', NULL, 10, 80, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Tortilla Chips', 'grams', 1500, 300, FALSE, 0.4
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Tortilla Chips' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 g bag', NULL, 500, 200, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Lumpia Wrapper', 'Pieces', 150, 20, TRUE, 1.5
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Lumpia Wrapper' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 50', NULL, 50, 75, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Nori Sheets', 'Pieces', 50, 10, TRUE, 6.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Nori Sheets' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Pack of 50', NULL, 50, 300, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Breading Mix', 'grams', 3000, 500, FALSE, 0.1
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Breading Mix' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 100, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Waffle Mix', 'grams', 2000, 300, FALSE, 0.2
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Waffle Mix' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pack', NULL, 1000, 200, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Dry Goods', 'Cooking Oil', 'mL', 8000, 2000, FALSE, 0.1
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cooking Oil' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '2 L bottle', NULL, 2000, 200, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 4, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Marinara Sauce', 'mL', 2000, 300, FALSE, 0.2
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Marinara Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L jar', NULL, 1000, 200, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Spaghetti Sauce', 'grams', 3000, 500, FALSE, 0.18
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Spaghetti Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg pouch', NULL, 1000, 180, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Pesto Sauce', 'grams', 570, 100, FALSE, 1.2
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Pesto Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '190 g jar', NULL, 190, 228, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Cheese Sauce', 'mL', 2000, 300, FALSE, 0.3
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cheese Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L tub', NULL, 1000, 300, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Japanese Mayo', 'mL', 1000, 200, FALSE, 0.35
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Japanese Mayo' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 mL bottle', NULL, 500, 175, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Mushroom Gravy', 'mL', 3000, 300, FALSE, 0.15
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Mushroom Gravy' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L pack', NULL, 1000, 150, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 3, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Honey Garlic Sauce', 'mL', 1000, 200, FALSE, 0.4
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Honey Garlic Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 mL bottle', NULL, 500, 200, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'BBQ Sauce', 'mL', 1000, 200, FALSE, 0.3
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'BBQ Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 mL bottle', NULL, 500, 150, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Buffalo Sauce', 'mL', 1000, 200, FALSE, 0.45
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Buffalo Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 mL bottle', NULL, 500, 225, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Kitchen Sauces', 'Sriracha', 'mL', 500, 100, FALSE, 0.35
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Sriracha' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '500 mL bottle', NULL, 500, 175, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

-- The food menu, as working tables for this script only
CREATE TEMP TABLE seed_food (product_name TEXT, category TEXT, description TEXT) ON COMMIT DROP;
INSERT INTO seed_food VALUES
  ('Mexicali Pizza', 'Pizza', 'Ground beef, onions and mozzarella with a little heat.'),
  ('Hawaiian Pizza', 'Pizza', 'Ham and pineapple with mozzarella.'),
  ('Pepperoni Pizza', 'Pizza', 'Pepperoni and mozzarella.'),
  ('Prosciutto Pizza', 'Pizza', 'Prosciutto, mozzarella and basil.'),
  ('Margherita Pizza', 'Pizza', 'Tomato, mozzarella and fresh basil.'),
  ('Double Decker Brew Houze', 'Pizza', 'House special. Two layers of pizza with pepperoni, ham and beef.'),
  ('Clubhouse with Fries', 'Sandwiches', 'Triple-decker with chicken, ham, bacon and egg, with fries.'),
  ('Egg Drop', 'Sandwiches', 'Soft scrambled egg and cheese in a brioche bun.'),
  ('Ham and Cheese', 'Sandwiches', 'Toasted ham and cheese sandwich.'),
  ('Black Burger with Mojos', 'Sandwiches', 'Beef burger in a black bun, with mojos.'),
  ('Marinara', 'Pasta', 'Tomato marinara pasta, served with focaccia bread.'),
  ('Carbonara', 'Pasta', 'Creamy bacon pasta, served with focaccia bread.'),
  ('Spaghetti', 'Pasta', 'Sweet-style spaghetti with beef and hotdog, served with focaccia bread.'),
  ('Pesto', 'Pasta', 'Basil pesto pasta, served with focaccia bread.'),
  ('Creamy Sriracha Wings', 'Wings', '6 pieces, tossed in creamy sriracha.'),
  ('Honey Garlic Wings', 'Wings', '6 pieces, tossed in honey garlic.'),
  ('Honey BBQ Wings', 'Wings', '6 pieces, tossed in honey barbecue.'),
  ('Buffalo Wings', 'Wings', '6 pieces, tossed in buffalo sauce.'),
  ('Parmesan Wings', 'Wings', '6 pieces, tossed in garlic and parmesan.'),
  ('Brew Houze Fried Sushi Roll', 'Sushi', 'House special. Crabstick and cucumber roll, fried crisp.'),
  ('Baked Sushi', 'Sushi', 'Sushi rice topped with creamy crab and cheese, baked.'),
  ('Kimbap', 'Sushi', 'Korean rice roll with egg, ham, crabstick and cucumber.'),
  ('Nachos', 'Snacks', 'Tortilla chips with cheese sauce, beef and tomatoes.'),
  ('Fries', 'Snacks', 'Golden fries.'),
  ('Mojos', 'Snacks', 'Breaded potato wedges.'),
  ('Crab and Cheese Sticks', 'Snacks', 'Crabstick and cheese in crispy wrappers.'),
  ('Baked Potato', 'Snacks', 'Baked potato with cream, cheese and bacon.'),
  ('Burrito', 'Snacks', 'Beef, rice and cheese wrapped in a tortilla.'),
  ('Waffle', 'Snacks', 'Fresh waffle.'),
  ('Onion Rings', 'Snacks', 'Breaded onion rings.'),
  ('Cheese Sticks', 'Snacks', 'Cheese in crispy wrappers.'),
  ('Tapsilog', 'Rice Meals', 'Beef tapa, garlic rice and egg.'),
  ('Porksilog', 'Rice Meals', 'Sweet pork, garlic rice and egg.'),
  ('Liemposilog', 'Rice Meals', 'Fried pork belly, garlic rice and egg.'),
  ('Tonkatsu', 'Rice Meals', 'Breaded pork cutlet with rice.'),
  ('Chicksilog', 'Rice Meals', 'Fried chicken, garlic rice and egg.'),
  ('Shanghaisilog', 'Rice Meals', 'Lumpiang shanghai, garlic rice and egg.'),
  ('Sizzling Burger Steak', 'Sizzling', 'Two burger patties in mushroom gravy, on a sizzling plate.'),
  ('Sizzling Sisig', 'Sizzling', 'Pork sisig with onions and egg, on a sizzling plate.'),
  ('Sizzling Liempo', 'Sizzling', 'Grilled pork belly with gravy, on a sizzling plate.'),
  ('Sizzling Pork Chop', 'Sizzling', 'Pork chop with gravy, on a sizzling plate.'),
  ('Sizzling Beef Mushroom', 'Sizzling', 'Beef and mushrooms in gravy, on a sizzling plate.'),
  ('Sizzling Hotdog', 'Sizzling', 'Hotdogs with onions and gravy, on a sizzling plate.'),
  ('Sizzling Shanghai', 'Sizzling', 'Lumpiang shanghai on a sizzling plate.'),
  ('Pigar-Pigar', 'Sizzling', 'Pangasinan-style fried beef strips with onions.');

CREATE TEMP TABLE seed_food_variants (product_name TEXT, size_label TEXT, price NUMERIC) ON COMMIT DROP;
INSERT INTO seed_food_variants VALUES
  ('Mexicali Pizza', 'Regular', 180),
  ('Hawaiian Pizza', 'Regular', 160),
  ('Pepperoni Pizza', 'Regular', 180),
  ('Prosciutto Pizza', 'Regular', 190),
  ('Margherita Pizza', 'Regular', 180),
  ('Double Decker Brew Houze', 'Regular', 320),
  ('Clubhouse with Fries', 'Regular', 180),
  ('Egg Drop', 'Regular', 95),
  ('Ham and Cheese', 'Regular', 75),
  ('Black Burger with Mojos', 'Regular', 190),
  ('Marinara', 'Regular', 180),
  ('Carbonara', 'Regular', 170),
  ('Spaghetti', 'Regular', 170),
  ('Pesto', 'Regular', 180),
  ('Creamy Sriracha Wings', 'Regular', 190),
  ('Honey Garlic Wings', 'Regular', 170),
  ('Honey BBQ Wings', 'Regular', 180),
  ('Buffalo Wings', 'Regular', 170),
  ('Parmesan Wings', 'Regular', 190),
  ('Brew Houze Fried Sushi Roll', 'Regular', 180),
  ('Baked Sushi', 'Regular', 180),
  ('Kimbap', 'Regular', 130),
  ('Nachos', 'Regular', 140),
  ('Fries', 'Regular', 80),
  ('Mojos', 'Regular', 95),
  ('Crab and Cheese Sticks', 'Regular', 120),
  ('Baked Potato', 'Regular', 120),
  ('Burrito', 'Regular', 150),
  ('Waffle', 'Regular', 100),
  ('Onion Rings', 'Regular', 95),
  ('Cheese Sticks', 'Regular', 95),
  ('Tapsilog', 'Regular', 150),
  ('Porksilog', 'Regular', 140),
  ('Liemposilog', 'Regular', 150),
  ('Tonkatsu', 'Regular', 150),
  ('Chicksilog', 'Regular', 130),
  ('Shanghaisilog', 'Regular', 120),
  ('Sizzling Burger Steak', 'With Rice', 150),
  ('Sizzling Sisig', 'With Rice', 150),
  ('Sizzling Sisig', 'Ala Carte', 180),
  ('Sizzling Liempo', 'With Rice', 180),
  ('Sizzling Liempo', 'Ala Carte', 200),
  ('Sizzling Pork Chop', 'With Rice', 170),
  ('Sizzling Pork Chop', 'Ala Carte', 180),
  ('Sizzling Beef Mushroom', 'With Rice', 180),
  ('Sizzling Beef Mushroom', 'Ala Carte', 230),
  ('Sizzling Hotdog', 'Ala Carte', 150),
  ('Sizzling Shanghai', 'Ala Carte', 130),
  ('Pigar-Pigar', 'Ala Carte', 200);

CREATE TEMP TABLE seed_food_recipes (product_name TEXT, size_label TEXT, item_name TEXT, qty NUMERIC) ON COMMIT DROP;
INSERT INTO seed_food_recipes VALUES
  ('Mexicali Pizza', 'Regular', 'Pizza Dough', 1),
  ('Mexicali Pizza', 'Regular', 'Pizza Sauce', 80),
  ('Mexicali Pizza', 'Regular', 'Mozzarella', 120),
  ('Mexicali Pizza', 'Regular', 'Ground Beef', 80),
  ('Mexicali Pizza', 'Regular', 'Onions', 30),
  ('Mexicali Pizza', 'Regular', 'Tomatoes', 30),
  ('Hawaiian Pizza', 'Regular', 'Pizza Dough', 1),
  ('Hawaiian Pizza', 'Regular', 'Pizza Sauce', 80),
  ('Hawaiian Pizza', 'Regular', 'Mozzarella', 120),
  ('Hawaiian Pizza', 'Regular', 'Ham', 60),
  ('Hawaiian Pizza', 'Regular', 'Pineapple Tidbits', 60),
  ('Pepperoni Pizza', 'Regular', 'Pizza Dough', 1),
  ('Pepperoni Pizza', 'Regular', 'Pizza Sauce', 80),
  ('Pepperoni Pizza', 'Regular', 'Mozzarella', 120),
  ('Pepperoni Pizza', 'Regular', 'Pepperoni', 60),
  ('Prosciutto Pizza', 'Regular', 'Pizza Dough', 1),
  ('Prosciutto Pizza', 'Regular', 'Pizza Sauce', 80),
  ('Prosciutto Pizza', 'Regular', 'Mozzarella', 120),
  ('Prosciutto Pizza', 'Regular', 'Prosciutto', 50),
  ('Prosciutto Pizza', 'Regular', 'Basil Leaves', 3),
  ('Margherita Pizza', 'Regular', 'Pizza Dough', 1),
  ('Margherita Pizza', 'Regular', 'Pizza Sauce', 90),
  ('Margherita Pizza', 'Regular', 'Mozzarella', 150),
  ('Margherita Pizza', 'Regular', 'Tomatoes', 60),
  ('Margherita Pizza', 'Regular', 'Basil Leaves', 5),
  ('Double Decker Brew Houze', 'Regular', 'Pizza Dough', 2),
  ('Double Decker Brew Houze', 'Regular', 'Pizza Sauce', 150),
  ('Double Decker Brew Houze', 'Regular', 'Mozzarella', 220),
  ('Double Decker Brew Houze', 'Regular', 'Pepperoni', 50),
  ('Double Decker Brew Houze', 'Regular', 'Ham', 50),
  ('Double Decker Brew Houze', 'Regular', 'Ground Beef', 60),
  ('Clubhouse with Fries', 'Regular', 'Sandwich Bread', 3),
  ('Clubhouse with Fries', 'Regular', 'Chicken Breast', 60),
  ('Clubhouse with Fries', 'Regular', 'Ham', 40),
  ('Clubhouse with Fries', 'Regular', 'Bacon', 30),
  ('Clubhouse with Fries', 'Regular', 'Eggs', 1),
  ('Clubhouse with Fries', 'Regular', 'Cheese Slices', 1),
  ('Clubhouse with Fries', 'Regular', 'Lettuce', 15),
  ('Clubhouse with Fries', 'Regular', 'Japanese Mayo', 15),
  ('Clubhouse with Fries', 'Regular', 'Potatoes', 150),
  ('Clubhouse with Fries', 'Regular', 'Cooking Oil', 30),
  ('Egg Drop', 'Regular', 'Brioche Bun', 1),
  ('Egg Drop', 'Regular', 'Eggs', 2),
  ('Egg Drop', 'Regular', 'Cheese Slices', 1),
  ('Egg Drop', 'Regular', 'Japanese Mayo', 15),
  ('Ham and Cheese', 'Regular', 'Sandwich Bread', 2),
  ('Ham and Cheese', 'Regular', 'Ham', 40),
  ('Ham and Cheese', 'Regular', 'Cheese Slices', 1),
  ('Black Burger with Mojos', 'Regular', 'Black Burger Bun', 1),
  ('Black Burger with Mojos', 'Regular', 'Burger Patty', 1),
  ('Black Burger with Mojos', 'Regular', 'Cheese Slices', 1),
  ('Black Burger with Mojos', 'Regular', 'Lettuce', 15),
  ('Black Burger with Mojos', 'Regular', 'Japanese Mayo', 10),
  ('Black Burger with Mojos', 'Regular', 'Potatoes', 150),
  ('Black Burger with Mojos', 'Regular', 'Breading Mix', 20),
  ('Black Burger with Mojos', 'Regular', 'Cooking Oil', 30),
  ('Marinara', 'Regular', 'Spaghetti Noodles', 120),
  ('Marinara', 'Regular', 'Focaccia Bread', 1),
  ('Marinara', 'Regular', 'Marinara Sauce', 150),
  ('Marinara', 'Regular', 'Garlic', 5),
  ('Marinara', 'Regular', 'Parmesan', 10),
  ('Carbonara', 'Regular', 'Spaghetti Noodles', 120),
  ('Carbonara', 'Regular', 'Focaccia Bread', 1),
  ('Carbonara', 'Regular', 'All-Purpose Cream', 150),
  ('Carbonara', 'Regular', 'Bacon', 40),
  ('Carbonara', 'Regular', 'Parmesan', 15),
  ('Carbonara', 'Regular', 'Garlic', 5),
  ('Spaghetti', 'Regular', 'Spaghetti Noodles', 120),
  ('Spaghetti', 'Regular', 'Focaccia Bread', 1),
  ('Spaghetti', 'Regular', 'Spaghetti Sauce', 150),
  ('Spaghetti', 'Regular', 'Ground Beef', 50),
  ('Spaghetti', 'Regular', 'Hotdog', 1),
  ('Spaghetti', 'Regular', 'Cheddar Cheese', 15),
  ('Pesto', 'Regular', 'Spaghetti Noodles', 120),
  ('Pesto', 'Regular', 'Focaccia Bread', 1),
  ('Pesto', 'Regular', 'Pesto Sauce', 50),
  ('Pesto', 'Regular', 'Parmesan', 15),
  ('Pesto', 'Regular', 'Garlic', 5),
  ('Creamy Sriracha Wings', 'Regular', 'Chicken Wings', 6),
  ('Creamy Sriracha Wings', 'Regular', 'Breading Mix', 40),
  ('Creamy Sriracha Wings', 'Regular', 'Cooking Oil', 60),
  ('Creamy Sriracha Wings', 'Regular', 'Sriracha', 20),
  ('Creamy Sriracha Wings', 'Regular', 'Japanese Mayo', 25),
  ('Honey Garlic Wings', 'Regular', 'Chicken Wings', 6),
  ('Honey Garlic Wings', 'Regular', 'Breading Mix', 40),
  ('Honey Garlic Wings', 'Regular', 'Cooking Oil', 60),
  ('Honey Garlic Wings', 'Regular', 'Honey Garlic Sauce', 40),
  ('Honey BBQ Wings', 'Regular', 'Chicken Wings', 6),
  ('Honey BBQ Wings', 'Regular', 'Breading Mix', 40),
  ('Honey BBQ Wings', 'Regular', 'Cooking Oil', 60),
  ('Honey BBQ Wings', 'Regular', 'BBQ Sauce', 40),
  ('Buffalo Wings', 'Regular', 'Chicken Wings', 6),
  ('Buffalo Wings', 'Regular', 'Breading Mix', 40),
  ('Buffalo Wings', 'Regular', 'Cooking Oil', 60),
  ('Buffalo Wings', 'Regular', 'Buffalo Sauce', 40),
  ('Parmesan Wings', 'Regular', 'Chicken Wings', 6),
  ('Parmesan Wings', 'Regular', 'Breading Mix', 40),
  ('Parmesan Wings', 'Regular', 'Cooking Oil', 60),
  ('Parmesan Wings', 'Regular', 'Parmesan', 20),
  ('Parmesan Wings', 'Regular', 'Garlic', 10),
  ('Brew Houze Fried Sushi Roll', 'Regular', 'Japanese Rice', 150),
  ('Brew Houze Fried Sushi Roll', 'Regular', 'Nori Sheets', 1),
  ('Brew Houze Fried Sushi Roll', 'Regular', 'Crabsticks', 2),
  ('Brew Houze Fried Sushi Roll', 'Regular', 'Cucumber', 30),
  ('Brew Houze Fried Sushi Roll', 'Regular', 'Japanese Mayo', 20),
  ('Brew Houze Fried Sushi Roll', 'Regular', 'Breading Mix', 30),
  ('Brew Houze Fried Sushi Roll', 'Regular', 'Cooking Oil', 50),
  ('Baked Sushi', 'Regular', 'Japanese Rice', 200),
  ('Baked Sushi', 'Regular', 'Nori Sheets', 1),
  ('Baked Sushi', 'Regular', 'Crabsticks', 3),
  ('Baked Sushi', 'Regular', 'Japanese Mayo', 40),
  ('Baked Sushi', 'Regular', 'Mozzarella', 30),
  ('Kimbap', 'Regular', 'Japanese Rice', 150),
  ('Kimbap', 'Regular', 'Nori Sheets', 1),
  ('Kimbap', 'Regular', 'Eggs', 1),
  ('Kimbap', 'Regular', 'Ham', 30),
  ('Kimbap', 'Regular', 'Crabsticks', 1),
  ('Kimbap', 'Regular', 'Cucumber', 30),
  ('Nachos', 'Regular', 'Tortilla Chips', 120),
  ('Nachos', 'Regular', 'Cheese Sauce', 60),
  ('Nachos', 'Regular', 'Ground Beef', 50),
  ('Nachos', 'Regular', 'Tomatoes', 30),
  ('Nachos', 'Regular', 'Onions', 20),
  ('Fries', 'Regular', 'Potatoes', 200),
  ('Fries', 'Regular', 'Cooking Oil', 40),
  ('Mojos', 'Regular', 'Potatoes', 200),
  ('Mojos', 'Regular', 'Breading Mix', 40),
  ('Mojos', 'Regular', 'Cooking Oil', 50),
  ('Crab and Cheese Sticks', 'Regular', 'Lumpia Wrapper', 8),
  ('Crab and Cheese Sticks', 'Regular', 'Crabsticks', 4),
  ('Crab and Cheese Sticks', 'Regular', 'Cheddar Cheese', 50),
  ('Crab and Cheese Sticks', 'Regular', 'Cooking Oil', 40),
  ('Baked Potato', 'Regular', 'Potatoes', 250),
  ('Baked Potato', 'Regular', 'All-Purpose Cream', 30),
  ('Baked Potato', 'Regular', 'Cheddar Cheese', 30),
  ('Baked Potato', 'Regular', 'Bacon', 20),
  ('Burrito', 'Regular', 'Tortilla Wrap', 1),
  ('Burrito', 'Regular', 'Ground Beef', 80),
  ('Burrito', 'Regular', 'Rice', 80),
  ('Burrito', 'Regular', 'Cheddar Cheese', 30),
  ('Burrito', 'Regular', 'Lettuce', 15),
  ('Burrito', 'Regular', 'Tomatoes', 20),
  ('Waffle', 'Regular', 'Waffle Mix', 100),
  ('Waffle', 'Regular', 'Eggs', 1),
  ('Waffle', 'Regular', 'Fresh Milk', 60),
  ('Onion Rings', 'Regular', 'Onions', 150),
  ('Onion Rings', 'Regular', 'Breading Mix', 50),
  ('Onion Rings', 'Regular', 'Cooking Oil', 50),
  ('Cheese Sticks', 'Regular', 'Lumpia Wrapper', 8),
  ('Cheese Sticks', 'Regular', 'Cheddar Cheese', 80),
  ('Cheese Sticks', 'Regular', 'Cooking Oil', 40),
  ('Tapsilog', 'Regular', 'Rice', 150),
  ('Tapsilog', 'Regular', 'Eggs', 1),
  ('Tapsilog', 'Regular', 'Garlic', 5),
  ('Tapsilog', 'Regular', 'Cooking Oil', 15),
  ('Tapsilog', 'Regular', 'Beef Tapa', 120),
  ('Porksilog', 'Regular', 'Rice', 150),
  ('Porksilog', 'Regular', 'Eggs', 1),
  ('Porksilog', 'Regular', 'Garlic', 5),
  ('Porksilog', 'Regular', 'Cooking Oil', 15),
  ('Porksilog', 'Regular', 'Pork Tocino', 120),
  ('Liemposilog', 'Regular', 'Rice', 150),
  ('Liemposilog', 'Regular', 'Eggs', 1),
  ('Liemposilog', 'Regular', 'Garlic', 5),
  ('Liemposilog', 'Regular', 'Cooking Oil', 15),
  ('Liemposilog', 'Regular', 'Pork Liempo', 150),
  ('Tonkatsu', 'Regular', 'Rice', 150),
  ('Tonkatsu', 'Regular', 'Pork Chop', 1),
  ('Tonkatsu', 'Regular', 'Eggs', 1),
  ('Tonkatsu', 'Regular', 'Breading Mix', 40),
  ('Tonkatsu', 'Regular', 'Cooking Oil', 50),
  ('Tonkatsu', 'Regular', 'Lettuce', 15),
  ('Chicksilog', 'Regular', 'Rice', 150),
  ('Chicksilog', 'Regular', 'Eggs', 1),
  ('Chicksilog', 'Regular', 'Garlic', 5),
  ('Chicksilog', 'Regular', 'Cooking Oil', 50),
  ('Chicksilog', 'Regular', 'Chicken Leg Quarter', 1),
  ('Chicksilog', 'Regular', 'Breading Mix', 30),
  ('Shanghaisilog', 'Regular', 'Rice', 150),
  ('Shanghaisilog', 'Regular', 'Eggs', 1),
  ('Shanghaisilog', 'Regular', 'Garlic', 5),
  ('Shanghaisilog', 'Regular', 'Cooking Oil', 15),
  ('Shanghaisilog', 'Regular', 'Lumpiang Shanghai', 6),
  ('Sizzling Burger Steak', 'With Rice', 'Burger Patty', 2),
  ('Sizzling Burger Steak', 'With Rice', 'Mushroom Gravy', 80),
  ('Sizzling Burger Steak', 'With Rice', 'Button Mushrooms', 20),
  ('Sizzling Burger Steak', 'With Rice', 'Rice', 150),
  ('Sizzling Sisig', 'With Rice', 'Pork Sisig Mix', 150),
  ('Sizzling Sisig', 'With Rice', 'Onions', 20),
  ('Sizzling Sisig', 'With Rice', 'Eggs', 1),
  ('Sizzling Sisig', 'With Rice', 'Rice', 150),
  ('Sizzling Sisig', 'Ala Carte', 'Pork Sisig Mix', 225),
  ('Sizzling Sisig', 'Ala Carte', 'Onions', 20),
  ('Sizzling Sisig', 'Ala Carte', 'Eggs', 1),
  ('Sizzling Liempo', 'With Rice', 'Pork Liempo', 180),
  ('Sizzling Liempo', 'With Rice', 'Mushroom Gravy', 60),
  ('Sizzling Liempo', 'With Rice', 'Rice', 150),
  ('Sizzling Liempo', 'Ala Carte', 'Pork Liempo', 270),
  ('Sizzling Liempo', 'Ala Carte', 'Mushroom Gravy', 60),
  ('Sizzling Pork Chop', 'With Rice', 'Pork Chop', 1),
  ('Sizzling Pork Chop', 'With Rice', 'Mushroom Gravy', 60),
  ('Sizzling Pork Chop', 'With Rice', 'Rice', 150),
  ('Sizzling Pork Chop', 'Ala Carte', 'Pork Chop', 1),
  ('Sizzling Pork Chop', 'Ala Carte', 'Mushroom Gravy', 60),
  ('Sizzling Beef Mushroom', 'With Rice', 'Beef Sirloin', 120),
  ('Sizzling Beef Mushroom', 'With Rice', 'Button Mushrooms', 50),
  ('Sizzling Beef Mushroom', 'With Rice', 'Mushroom Gravy', 80),
  ('Sizzling Beef Mushroom', 'With Rice', 'Rice', 150),
  ('Sizzling Beef Mushroom', 'Ala Carte', 'Beef Sirloin', 180),
  ('Sizzling Beef Mushroom', 'Ala Carte', 'Button Mushrooms', 75),
  ('Sizzling Beef Mushroom', 'Ala Carte', 'Mushroom Gravy', 80),
  ('Sizzling Hotdog', 'Ala Carte', 'Hotdog', 3),
  ('Sizzling Hotdog', 'Ala Carte', 'Onions', 20),
  ('Sizzling Hotdog', 'Ala Carte', 'Mushroom Gravy', 40),
  ('Sizzling Shanghai', 'Ala Carte', 'Lumpiang Shanghai', 10),
  ('Pigar-Pigar', 'Ala Carte', 'Beef Sirloin', 200),
  ('Pigar-Pigar', 'Ala Carte', 'Onions', 60),
  ('Pigar-Pigar', 'Ala Carte', 'Cooking Oil', 30);

-- Dishes, made in the kitchen
INSERT INTO products (product_name, product_description, product_category, product_type, station, price)
SELECT s.product_name, s.description, s.category, 'recipe', 'kitchen', (SELECT MIN(v.price) FROM seed_food_variants v WHERE v.product_name = s.product_name)
FROM seed_food s
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.product_name = s.product_name AND p.is_archived = FALSE);

-- Options (Regular, or With Rice and Ala Carte for sizzling dishes)
INSERT INTO product_variants (product_id, size_label, temperature, price)
SELECT p.product_id, v.size_label, NULL, v.price
FROM seed_food_variants v
JOIN products p ON p.product_name = v.product_name AND p.is_archived = FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM product_variants pv
  WHERE pv.product_id = p.product_id AND LOWER(TRIM(pv.size_label)) = LOWER(v.size_label) AND pv.temperature IS NULL
);

-- Recipes, only for options that have none yet
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT pv.product_variant_id, inv.inventory_id, r.qty
FROM seed_food_recipes r
JOIN products p ON p.product_name = r.product_name AND p.is_archived = FALSE
JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE
  AND LOWER(TRIM(pv.size_label)) = LOWER(r.size_label) AND pv.temperature IS NULL
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE
WHERE NOT EXISTS (SELECT 1 FROM variant_ingredients vi WHERE vi.product_variant_id = pv.product_variant_id);

COMMIT;
