-- Test data: inventory, menu and add-ons (development only)
--
-- Adds a small cafe menu to an empty system, the same way the admin app would save it:
--   13 inventory items with a package and pack price each (so costs and profit work)
--   1 portion (Espresso Shot, 18 g of Espresso Beans per shot)
--   4 categories, 7 drinks in 12 oz and 16 oz, hot and iced, with full recipes
--   2 direct-sale items (Bottled Water, Chocolate Chip Cookie), 4 add-ons
-- For testing stock states: Caramel Sauce is at 0 (Caramel Macchiato and Caramel Drizzle show
-- as sold out) and Oat Milk is running low. Each item is logged in stock history as created.
--
-- Run in the Supabase SQL editor, after reset-dev-data.sql. Rows that already exist are
-- skipped, so running it twice adds nothing new.

-- Categories
INSERT INTO product_categories (category_name) VALUES ('Espresso Based'), ('Non-Coffee'), ('Drinks'), ('Pastries')
ON CONFLICT (category_name) DO NOTHING;

-- Inventory items, each with its package and a created entry in stock history
WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Coffee', 'Espresso Beans', 'grams', 2000, 500, FALSE, 0.85
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Espresso Beans' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 kg bag', 'Brew Houze House Blend', 1000, 850, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 2, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Dairy', 'Fresh Milk', 'mL', 12000, 3000, FALSE, 0.095
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Fresh Milk' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L carton', 'Magnolia', 1000, 95, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 12, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Dairy', 'Oat Milk', 'mL', 400, 1000, FALSE, 0.185
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Oat Milk' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L carton', 'Oatside', 1000, 185, NULL FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  NULL, NULL, NULL, NULL
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Dairy', 'Condensed Milk', 'grams', 2340, 400, FALSE, 0.1923
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Condensed Milk' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '390 g can', 'Alaska', 390, 75, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 6, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Sauces', 'Chocolate Sauce', 'mL', 1890, 300, FALSE, 0.2751
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Chocolate Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1.89 L bottle', 'Hersheys', 1890, 520, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Sauces', 'Caramel Sauce', 'mL', 0, 300, FALSE, 0.48
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Caramel Sauce' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '1 L bottle', 'Monin', 1000, 480, NULL FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  NULL, NULL, NULL, NULL
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Syrups', 'Vanilla Syrup', 'mL', 750, 150, FALSE, 0.56
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Vanilla Syrup' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '750 mL bottle', 'Monin', 750, 420, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Powders', 'Matcha Powder', 'grams', 500, 100, FALSE, 3.5
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Matcha Powder' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, '100 g pouch', 'Uji Matcha', 100, 350, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 5, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Packaging', 'Cups 12 oz', 'Pieces', 300, 50, TRUE, 3.5
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cups 12 oz' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Sleeve of 50', NULL, 50, 175, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 6, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Packaging', 'Cups 16 oz', 'Pieces', 300, 50, TRUE, 4.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Cups 16 oz' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Sleeve of 50', NULL, 50, 200, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 6, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Packaging', 'Lids', 'Pieces', 500, 100, TRUE, 1.2
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Lids' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Sleeve of 100', NULL, 100, 120, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 5, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Retail', 'Bottled Water', 'Bottles', 24, 6, TRUE, 10.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Bottled Water' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Case of 24', 'Wilkins', 24, 240, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, unit_cost)
  SELECT 'Pastries', 'Chocolate Chip Cookie', 'Pieces', 12, 4, TRUE, 25.0
  WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Chocolate Chip Cookie' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity, unit_cost
), pack AS (
  INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
  SELECT inventory_id, 'Box of 12', NULL, 12, 300, CURRENT_TIMESTAMP FROM item
  RETURNING packaging_id, packaging_name, last_pack_price
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
SELECT item.inventory_id, item.item_name, item.ingredient_category, item.unit_of_measure, 'created', 0, item.quantity, item.quantity, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', item.unit_cost,
  pack.packaging_id, pack.packaging_name, 1, pack.last_pack_price
FROM item CROSS JOIN pack;

-- Portions: stock and cost come from the source item
WITH item AS (
  INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, derived_from_inventory_id, derived_ratio)
  SELECT 'Coffee', 'Espresso Shot', 'Pieces', 0, 10, TRUE, src.inventory_id, 18
  FROM inventory src
  WHERE src.item_name = 'Espresso Beans' AND src.is_archived = FALSE
    AND NOT EXISTS (SELECT 1 FROM inventory WHERE item_name = 'Espresso Shot' AND is_archived = FALSE)
  RETURNING inventory_id, item_name, ingredient_category, unit_of_measure
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app)
SELECT inventory_id, item_name, ingredient_category, unit_of_measure, 'created', 0, 0, 0, (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin' FROM item;

-- Products, their sizes and recipes
WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Americano', 'Espresso and hot water, or over ice.', 'Espresso Based', 'recipe', 100
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Americano' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('12 oz', 'hot', 100), ('12 oz', 'cold', 110), ('16 oz', 'hot', 120), ('16 oz', 'cold', 130)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('12 oz', 'hot', 'Espresso Shot', 2),
    ('12 oz', 'hot', 'Cups 12 oz', 1),
    ('12 oz', 'hot', 'Lids', 1),
    ('12 oz', 'cold', 'Espresso Shot', 2),
    ('12 oz', 'cold', 'Cups 12 oz', 1),
    ('12 oz', 'cold', 'Lids', 1),
    ('16 oz', 'hot', 'Espresso Shot', 3),
    ('16 oz', 'hot', 'Cups 16 oz', 1),
    ('16 oz', 'hot', 'Lids', 1),
    ('16 oz', 'cold', 'Espresso Shot', 3),
    ('16 oz', 'cold', 'Cups 16 oz', 1),
    ('16 oz', 'cold', 'Lids', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Cafe Latte', 'Espresso with steamed or cold milk.', 'Espresso Based', 'recipe', 130
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Cafe Latte' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('12 oz', 'hot', 130), ('12 oz', 'cold', 140), ('16 oz', 'hot', 150), ('16 oz', 'cold', 160)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('12 oz', 'hot', 'Espresso Shot', 2),
    ('12 oz', 'hot', 'Fresh Milk', 180),
    ('12 oz', 'hot', 'Cups 12 oz', 1),
    ('12 oz', 'hot', 'Lids', 1),
    ('12 oz', 'cold', 'Espresso Shot', 2),
    ('12 oz', 'cold', 'Fresh Milk', 150),
    ('12 oz', 'cold', 'Cups 12 oz', 1),
    ('12 oz', 'cold', 'Lids', 1),
    ('16 oz', 'hot', 'Espresso Shot', 2),
    ('16 oz', 'hot', 'Fresh Milk', 250),
    ('16 oz', 'hot', 'Cups 16 oz', 1),
    ('16 oz', 'hot', 'Lids', 1),
    ('16 oz', 'cold', 'Espresso Shot', 2),
    ('16 oz', 'cold', 'Fresh Milk', 220),
    ('16 oz', 'cold', 'Cups 16 oz', 1),
    ('16 oz', 'cold', 'Lids', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Spanish Latte', 'Latte sweetened with condensed milk.', 'Espresso Based', 'recipe', 145
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Spanish Latte' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('12 oz', 'hot', 145), ('12 oz', 'cold', 155), ('16 oz', 'hot', 165), ('16 oz', 'cold', 175)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('12 oz', 'hot', 'Espresso Shot', 2),
    ('12 oz', 'hot', 'Fresh Milk', 150),
    ('12 oz', 'hot', 'Condensed Milk', 30),
    ('12 oz', 'hot', 'Cups 12 oz', 1),
    ('12 oz', 'hot', 'Lids', 1),
    ('12 oz', 'cold', 'Espresso Shot', 2),
    ('12 oz', 'cold', 'Fresh Milk', 150),
    ('12 oz', 'cold', 'Condensed Milk', 30),
    ('12 oz', 'cold', 'Cups 12 oz', 1),
    ('12 oz', 'cold', 'Lids', 1),
    ('16 oz', 'hot', 'Espresso Shot', 2),
    ('16 oz', 'hot', 'Fresh Milk', 200),
    ('16 oz', 'hot', 'Condensed Milk', 40),
    ('16 oz', 'hot', 'Cups 16 oz', 1),
    ('16 oz', 'hot', 'Lids', 1),
    ('16 oz', 'cold', 'Espresso Shot', 2),
    ('16 oz', 'cold', 'Fresh Milk', 200),
    ('16 oz', 'cold', 'Condensed Milk', 40),
    ('16 oz', 'cold', 'Cups 16 oz', 1),
    ('16 oz', 'cold', 'Lids', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Caramel Macchiato', 'Vanilla milk, espresso and caramel on top.', 'Espresso Based', 'recipe', 150
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Caramel Macchiato' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('12 oz', 'hot', 150), ('12 oz', 'cold', 160), ('16 oz', 'hot', 170), ('16 oz', 'cold', 180)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('12 oz', 'hot', 'Espresso Shot', 2),
    ('12 oz', 'hot', 'Fresh Milk', 160),
    ('12 oz', 'hot', 'Vanilla Syrup', 10),
    ('12 oz', 'hot', 'Caramel Sauce', 20),
    ('12 oz', 'hot', 'Cups 12 oz', 1),
    ('12 oz', 'hot', 'Lids', 1),
    ('12 oz', 'cold', 'Espresso Shot', 2),
    ('12 oz', 'cold', 'Fresh Milk', 160),
    ('12 oz', 'cold', 'Vanilla Syrup', 10),
    ('12 oz', 'cold', 'Caramel Sauce', 20),
    ('12 oz', 'cold', 'Cups 12 oz', 1),
    ('12 oz', 'cold', 'Lids', 1),
    ('16 oz', 'hot', 'Espresso Shot', 2),
    ('16 oz', 'hot', 'Fresh Milk', 220),
    ('16 oz', 'hot', 'Vanilla Syrup', 15),
    ('16 oz', 'hot', 'Caramel Sauce', 30),
    ('16 oz', 'hot', 'Cups 16 oz', 1),
    ('16 oz', 'hot', 'Lids', 1),
    ('16 oz', 'cold', 'Espresso Shot', 2),
    ('16 oz', 'cold', 'Fresh Milk', 220),
    ('16 oz', 'cold', 'Vanilla Syrup', 15),
    ('16 oz', 'cold', 'Caramel Sauce', 30),
    ('16 oz', 'cold', 'Cups 16 oz', 1),
    ('16 oz', 'cold', 'Lids', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Cafe Mocha', 'Espresso, chocolate and milk.', 'Espresso Based', 'recipe', 145
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Cafe Mocha' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('12 oz', 'hot', 145), ('12 oz', 'cold', 155), ('16 oz', 'hot', 165), ('16 oz', 'cold', 175)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('12 oz', 'hot', 'Espresso Shot', 2),
    ('12 oz', 'hot', 'Fresh Milk', 150),
    ('12 oz', 'hot', 'Chocolate Sauce', 25),
    ('12 oz', 'hot', 'Cups 12 oz', 1),
    ('12 oz', 'hot', 'Lids', 1),
    ('12 oz', 'cold', 'Espresso Shot', 2),
    ('12 oz', 'cold', 'Fresh Milk', 150),
    ('12 oz', 'cold', 'Chocolate Sauce', 25),
    ('12 oz', 'cold', 'Cups 12 oz', 1),
    ('12 oz', 'cold', 'Lids', 1),
    ('16 oz', 'hot', 'Espresso Shot', 2),
    ('16 oz', 'hot', 'Fresh Milk', 200),
    ('16 oz', 'hot', 'Chocolate Sauce', 35),
    ('16 oz', 'hot', 'Cups 16 oz', 1),
    ('16 oz', 'hot', 'Lids', 1),
    ('16 oz', 'cold', 'Espresso Shot', 2),
    ('16 oz', 'cold', 'Fresh Milk', 200),
    ('16 oz', 'cold', 'Chocolate Sauce', 35),
    ('16 oz', 'cold', 'Cups 16 oz', 1),
    ('16 oz', 'cold', 'Lids', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Matcha Latte', 'Ceremonial matcha with milk.', 'Non-Coffee', 'recipe', 150
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Matcha Latte' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('12 oz', 'hot', 150), ('12 oz', 'cold', 160), ('16 oz', 'hot', 170), ('16 oz', 'cold', 180)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('12 oz', 'hot', 'Matcha Powder', 5),
    ('12 oz', 'hot', 'Fresh Milk', 200),
    ('12 oz', 'hot', 'Cups 12 oz', 1),
    ('12 oz', 'hot', 'Lids', 1),
    ('12 oz', 'cold', 'Matcha Powder', 5),
    ('12 oz', 'cold', 'Fresh Milk', 200),
    ('12 oz', 'cold', 'Cups 12 oz', 1),
    ('12 oz', 'cold', 'Lids', 1),
    ('16 oz', 'hot', 'Matcha Powder', 7),
    ('16 oz', 'hot', 'Fresh Milk', 280),
    ('16 oz', 'hot', 'Cups 16 oz', 1),
    ('16 oz', 'hot', 'Lids', 1),
    ('16 oz', 'cold', 'Matcha Powder', 7),
    ('16 oz', 'cold', 'Fresh Milk', 280),
    ('16 oz', 'cold', 'Cups 16 oz', 1),
    ('16 oz', 'cold', 'Lids', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Chocolate', 'Rich chocolate with milk, hot or iced.', 'Non-Coffee', 'recipe', 120
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Chocolate' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('12 oz', 'hot', 120), ('12 oz', 'cold', 130), ('16 oz', 'hot', 140), ('16 oz', 'cold', 150)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('12 oz', 'hot', 'Chocolate Sauce', 40),
    ('12 oz', 'hot', 'Fresh Milk', 200),
    ('12 oz', 'hot', 'Cups 12 oz', 1),
    ('12 oz', 'hot', 'Lids', 1),
    ('12 oz', 'cold', 'Chocolate Sauce', 40),
    ('12 oz', 'cold', 'Fresh Milk', 200),
    ('12 oz', 'cold', 'Cups 12 oz', 1),
    ('12 oz', 'cold', 'Lids', 1),
    ('16 oz', 'hot', 'Chocolate Sauce', 55),
    ('16 oz', 'hot', 'Fresh Milk', 280),
    ('16 oz', 'hot', 'Cups 16 oz', 1),
    ('16 oz', 'hot', 'Lids', 1),
    ('16 oz', 'cold', 'Chocolate Sauce', 55),
    ('16 oz', 'cold', 'Fresh Milk', 280),
    ('16 oz', 'cold', 'Cups 16 oz', 1),
    ('16 oz', 'cold', 'Lids', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Bottled Water', '500 mL bottled water.', 'Drinks', 'stock', 25
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Bottled Water' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('Regular', NULL::varchar, 25)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('Regular', NULL::varchar, 'Bottled Water', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

WITH product AS (
  INSERT INTO products (product_name, product_description, product_category, product_type, price)
  SELECT 'Chocolate Chip Cookie', 'Freshly baked, chewy centre.', 'Pastries', 'stock', 65
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Chocolate Chip Cookie' AND is_archived = FALSE)
  RETURNING product_id
), sizes AS (
  INSERT INTO product_variants (product_id, size_label, temperature, price)
  SELECT product.product_id, v.size_label, v.temperature, v.price
  FROM product CROSS JOIN (VALUES ('Regular', NULL::varchar, 65)) AS v(size_label, temperature, price)
  RETURNING product_variant_id, size_label, temperature
)
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity)
SELECT sizes.product_variant_id, inv.inventory_id, r.qty
FROM sizes
JOIN (VALUES
    ('Regular', NULL::varchar, 'Chocolate Chip Cookie', 1)
  ) AS r(size_label, temperature, item_name, qty)
  ON r.size_label = sizes.size_label AND r.temperature IS NOT DISTINCT FROM sizes.temperature
JOIN inventory inv ON inv.item_name = r.item_name AND inv.is_archived = FALSE;

-- Add-ons (they can go on any drink at the counter)
INSERT INTO additions (addition_name, inventory_id, quantity, price)
SELECT 'Extra Shot', inventory_id, 1, 30 FROM inventory WHERE item_name = 'Espresso Shot' AND is_archived = FALSE
ON CONFLICT (addition_name) DO NOTHING;

INSERT INTO additions (addition_name, inventory_id, quantity, price)
SELECT 'Oat Milk', inventory_id, 150, 30 FROM inventory WHERE item_name = 'Oat Milk' AND is_archived = FALSE
ON CONFLICT (addition_name) DO NOTHING;

INSERT INTO additions (addition_name, inventory_id, quantity, price)
SELECT 'Vanilla Syrup', inventory_id, 15, 20 FROM inventory WHERE item_name = 'Vanilla Syrup' AND is_archived = FALSE
ON CONFLICT (addition_name) DO NOTHING;

INSERT INTO additions (addition_name, inventory_id, quantity, price)
SELECT 'Caramel Drizzle', inventory_id, 15, 20 FROM inventory WHERE item_name = 'Caramel Sauce' AND is_archived = FALSE
ON CONFLICT (addition_name) DO NOTHING;
