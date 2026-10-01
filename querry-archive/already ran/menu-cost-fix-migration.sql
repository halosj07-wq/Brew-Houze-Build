-- Menu cost fix: corrects the estimated costs from the two menu seeds
--
-- 1. Food options split by the old menu editor. Saving a dish before the editor fix turned its
--    Regular option into a Regular Hot and a Regular Cold (Buffalo Wings and Creamy Sriracha
--    Wings). For kitchen dishes, the hot copy goes back to a plain option and the cold copy is
--    archived.
-- 2. Lower estimated costs for 42 items the seeds added, at local supplier prices instead of
--    premium brands. Each change is logged in stock history as a cost update. An item whose cost
--    was already changed by hand is left alone.
-- 3. Smaller portions on 230 recipe lines. The seeds counted one Espresso Shot as a single shot,
--    but in this system one shot is 18 g of beans, a double. Drinks now use 1 shot up to 16 oz and
--    2 shots at 22 oz, with less syrup and sauce, and dishes use less cheese and meat. A recipe
--    line that was already changed by hand is left alone.
--
-- Prices on the menu do not change. Afterwards most drinks and dishes earn about half their price.
-- The lowest are the 22 oz flavored drinks (about 26 to 37 percent), because of the cost of two
-- shots plus vanilla syrup and caramel sauce.
--
-- Run in the Supabase SQL editor. Safe to run again: anything already fixed is skipped.

BEGIN;

-- 1. Food options split into hot and cold
UPDATE product_variants cold
SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
FROM products p
WHERE cold.product_id = p.product_id
  AND p.station = 'kitchen' AND p.is_archived = FALSE
  AND cold.is_archived = FALSE AND cold.temperature = 'cold'
  AND LOWER(TRIM(cold.size_label)) NOT LIKE '% oz'
  AND EXISTS (
    SELECT 1 FROM product_variants hot
    WHERE hot.product_id = cold.product_id AND hot.is_archived = FALSE AND hot.temperature = 'hot'
      AND LOWER(TRIM(hot.size_label)) = LOWER(TRIM(cold.size_label))
  );

UPDATE product_variants pv
SET temperature = NULL, updated_at = CURRENT_TIMESTAMP
FROM products p
WHERE pv.product_id = p.product_id
  AND p.station = 'kitchen' AND p.is_archived = FALSE
  AND pv.is_archived = FALSE AND pv.temperature IS NOT NULL
  AND LOWER(TRIM(pv.size_label)) NOT LIKE '% oz'
  AND NOT EXISTS (
    SELECT 1 FROM product_variants other
    WHERE other.product_id = pv.product_id AND other.temperature IS NULL
      AND other.size_label = pv.size_label
  );

-- 2. Estimated costs
CREATE TEMP TABLE fix_costs (item_name TEXT, packaging_name TEXT, old_cost NUMERIC, new_pack_price NUMERIC, new_cost NUMERIC) ON COMMIT DROP;
INSERT INTO fix_costs VALUES
  ('Cups 8 oz', 'Sleeve of 50', 3.0, 125, 2.5),
  ('Cups 22 oz', 'Sleeve of 50', 5.0, 225, 4.5),
  ('Straws', 'Pack of 100', 0.5, 40, 0.4),
  ('Hazelnut Syrup', '750 mL bottle', 0.56, 280, 0.3733),
  ('Salted Caramel Syrup', '750 mL bottle', 0.56, 280, 0.3733),
  ('Strawberry Syrup', '1 L bottle', 0.45, 300, 0.3),
  ('Peach Mango Syrup', '1 L bottle', 0.45, 300, 0.3),
  ('Passion Fruit Syrup', '1 L bottle', 0.45, 300, 0.3),
  ('Blueberry Syrup', '1 L bottle', 0.45, 300, 0.3),
  ('Sugar Syrup', '1 L bottle', 0.12, 80, 0.08),
  ('White Chocolate Sauce', '1 L bottle', 0.48, 350, 0.35),
  ('Almond Milk', '1 L carton', 0.22, 180, 0.18),
  ('Whipping Cream', '1 L carton', 0.28, 260, 0.26),
  ('Cream Cheese', '1 kg block', 0.6, 420, 0.42),
  ('Fior di Latte Gelato', '2.5 kg tub', 0.5, 650, 0.26),
  ('Frappe Base Powder', '1 kg pack', 0.65, 450, 0.45),
  ('Crushed Oreo', '500 g pack', 0.56, 180, 0.36),
  ('Java Chips', '1 kg pack', 0.6, 400, 0.4),
  ('Black Tea Leaves', '500 g pack', 0.9, 250, 0.5),
  ('Honey', '1 L bottle', 0.55, 400, 0.4),
  ('Lemon Juice', '1 L bottle', 0.25, 180, 0.18),
  ('Mint Leaves', '100 g pack', 0.8, 60, 0.6),
  ('Soda Water', '1.5 L bottle', 0.04, 55, 0.0367),
  ('Pizza Dough', 'Pack of 10', 25.0, 150, 15.0),
  ('Pizza Sauce', '1 L jar', 0.15, 120, 0.12),
  ('Mozzarella', '1 kg block', 0.55, 420, 0.42),
  ('Cheddar Cheese', '1 kg block', 0.45, 380, 0.38),
  ('Parmesan', '250 g pack', 1.5, 250, 1.0),
  ('All-Purpose Cream', '250 mL pack', 0.26, 60, 0.24),
  ('Pepperoni', '500 g pack', 0.8, 250, 0.5),
  ('Ham', '1 kg pack', 0.45, 320, 0.32),
  ('Prosciutto', '250 g pack', 1.8, 300, 1.2),
  ('Bacon', '1 kg pack', 0.9, 600, 0.6),
  ('Ground Beef', '1 kg pack', 0.42, 380, 0.38),
  ('Chicken Wings', 'Pack of 24', 14.0, 264, 11.0),
  ('Beef Sirloin', '1 kg pack', 0.7, 520, 0.52),
  ('Focaccia Bread', 'Tray of 12', 15.0, 120, 10.0),
  ('Tortilla Chips', '500 g bag', 0.4, 150, 0.3),
  ('Cheese Sauce', '1 L tub', 0.3, 220, 0.22),
  ('Honey Garlic Sauce', '500 mL bottle', 0.4, 150, 0.3),
  ('BBQ Sauce', '500 mL bottle', 0.3, 100, 0.2),
  ('Buffalo Sauce', '500 mL bottle', 0.45, 150, 0.3);

UPDATE inventory_packaging pk
SET last_pack_price = f.new_pack_price
FROM fix_costs f
JOIN inventory i ON i.item_name = f.item_name AND i.is_archived = FALSE
WHERE pk.inventory_id = i.inventory_id
  AND pk.packaging_name = f.packaging_name
  AND ROUND(i.unit_cost, 4) = f.old_cost;

WITH changed AS (
  UPDATE inventory i
  SET unit_cost = f.new_cost, updated_at = CURRENT_TIMESTAMP
  FROM fix_costs f
  WHERE i.item_name = f.item_name AND i.is_archived = FALSE
    AND ROUND(i.unit_cost, 4) = f.old_cost
  RETURNING i.inventory_id, i.item_name, i.ingredient_category, i.unit_of_measure, i.quantity, f.old_cost, f.new_cost
)
INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_before, unit_cost_after, note)
SELECT inventory_id, item_name, ingredient_category, unit_of_measure, 'cost_updated', quantity, quantity, 0,
  (SELECT admin_id FROM admin_users WHERE LOWER(role) = 'admin' AND is_active ORDER BY admin_id LIMIT 1), 'admin', old_cost, new_cost,
  'Estimated cost corrected'
FROM changed;

-- 3. Portions
CREATE TEMP TABLE fix_recipes (product_name TEXT, size_label TEXT, item_name TEXT, old_qty NUMERIC, new_qty NUMERIC) ON COMMIT DROP;
INSERT INTO fix_recipes VALUES
  ('Americano', '12 oz', 'Espresso Shot', 2, 1),
  ('Americano', '16 oz', 'Espresso Shot', 2, 1),
  ('Americano', '22 oz', 'Espresso Shot', 3, 2),
  ('Espresso', '12 oz', 'Espresso Shot', 2, 1),
  ('Espresso', '16 oz', 'Espresso Shot', 2, 1),
  ('Espresso', '22 oz', 'Espresso Shot', 3, 2),
  ('Macchiato', '12 oz', 'Espresso Shot', 2, 1),
  ('Macchiato', '16 oz', 'Espresso Shot', 2, 1),
  ('Macchiato', '22 oz', 'Espresso Shot', 3, 2),
  ('Macchiato', '22 oz', 'Fresh Milk', 136, 120),
  ('Cappuccino', '12 oz', 'Espresso Shot', 2, 1),
  ('Cappuccino', '16 oz', 'Espresso Shot', 2, 1),
  ('Cappuccino', '22 oz', 'Espresso Shot', 3, 2),
  ('Cappuccino', '22 oz', 'Fresh Milk', 255, 225),
  ('Latte', '12 oz', 'Espresso Shot', 2, 1),
  ('Latte', '16 oz', 'Espresso Shot', 2, 1),
  ('Latte', '22 oz', 'Espresso Shot', 3, 2),
  ('Latte', '22 oz', 'Fresh Milk', 340, 300),
  ('Flat White', '8 oz', 'Espresso Shot', 2, 1),
  ('Flat White', '12 oz', 'Espresso Shot', 3, 2),
  ('Flat White', '16 oz', 'Espresso Shot', 3, 2),
  ('Flat White', '22 oz', 'Espresso Shot', 4, 2),
  ('Flat White', '22 oz', 'Fresh Milk', 272, 240),
  ('Spanish Latte', '12 oz', 'Espresso Shot', 2, 1),
  ('Spanish Latte', '16 oz', 'Espresso Shot', 2, 1),
  ('Spanish Latte', '22 oz', 'Espresso Shot', 3, 2),
  ('Spanish Latte', '22 oz', 'Fresh Milk', 289, 255),
  ('Caramel Chocolate', '12 oz', 'Chocolate Sauce', 20, 15),
  ('Caramel Chocolate', '12 oz', 'Caramel Sauce', 12, 9),
  ('Caramel Chocolate', '16 oz', 'Chocolate Sauce', 25, 20),
  ('Caramel Chocolate', '16 oz', 'Caramel Sauce', 15, 12),
  ('Caramel Chocolate', '22 oz', 'Fresh Milk', 340, 300),
  ('Caramel Chocolate', '22 oz', 'Chocolate Sauce', 35, 25),
  ('Caramel Chocolate', '22 oz', 'Caramel Sauce', 21, 15),
  ('Vanilla Latte', '12 oz', 'Espresso Shot', 2, 1),
  ('Vanilla Latte', '12 oz', 'Vanilla Syrup', 15, 10),
  ('Vanilla Latte', '16 oz', 'Espresso Shot', 2, 1),
  ('Vanilla Latte', '16 oz', 'Vanilla Syrup', 20, 15),
  ('Vanilla Latte', '22 oz', 'Espresso Shot', 3, 2),
  ('Vanilla Latte', '22 oz', 'Fresh Milk', 340, 300),
  ('Vanilla Latte', '22 oz', 'Vanilla Syrup', 30, 20),
  ('Marocchino', '12 oz', 'Espresso Shot', 2, 1),
  ('Marocchino', '12 oz', 'Chocolate Sauce', 20, 15),
  ('Marocchino', '16 oz', 'Espresso Shot', 2, 1),
  ('Marocchino', '16 oz', 'Chocolate Sauce', 25, 20),
  ('Marocchino', '22 oz', 'Espresso Shot', 3, 2),
  ('Marocchino', '22 oz', 'Fresh Milk', 204, 180),
  ('Marocchino', '22 oz', 'Chocolate Sauce', 35, 25),
  ('Tropical Brew Houze', '12 oz', 'Espresso Shot', 2, 1),
  ('Tropical Brew Houze', '12 oz', 'Peach Mango Syrup', 22, 15),
  ('Tropical Brew Houze', '16 oz', 'Espresso Shot', 2, 1),
  ('Tropical Brew Houze', '16 oz', 'Peach Mango Syrup', 30, 22),
  ('Tropical Brew Houze', '22 oz', 'Espresso Shot', 3, 2),
  ('Tropical Brew Houze', '22 oz', 'Peach Mango Syrup', 45, 30),
  ('Tropical Brew Houze', '22 oz', 'Soda Water', 272, 240),
  ('Caramel Macchiato', '12 oz', 'Espresso Shot', 2, 1),
  ('Caramel Macchiato', '12 oz', 'Vanilla Syrup', 10, 7),
  ('Caramel Macchiato', '12 oz', 'Caramel Sauce', 20, 15),
  ('Caramel Macchiato', '16 oz', 'Espresso Shot', 2, 1),
  ('Caramel Macchiato', '16 oz', 'Vanilla Syrup', 14, 10),
  ('Caramel Macchiato', '16 oz', 'Caramel Sauce', 25, 20),
  ('Caramel Macchiato', '22 oz', 'Espresso Shot', 3, 2),
  ('Caramel Macchiato', '22 oz', 'Fresh Milk', 340, 300),
  ('Caramel Macchiato', '22 oz', 'Vanilla Syrup', 21, 14),
  ('Caramel Macchiato', '22 oz', 'Caramel Sauce', 35, 25),
  ('Winter Brew Houze', '12 oz', 'Espresso Shot', 2, 1),
  ('Winter Brew Houze', '12 oz', 'White Chocolate Sauce', 20, 15),
  ('Winter Brew Houze', '12 oz', 'Whipping Cream', 20, 15),
  ('Winter Brew Houze', '16 oz', 'Espresso Shot', 2, 1),
  ('Winter Brew Houze', '16 oz', 'White Chocolate Sauce', 25, 20),
  ('Winter Brew Houze', '16 oz', 'Whipping Cream', 25, 20),
  ('Winter Brew Houze', '22 oz', 'Espresso Shot', 3, 2),
  ('Winter Brew Houze', '22 oz', 'Fresh Milk', 340, 300),
  ('Winter Brew Houze', '22 oz', 'White Chocolate Sauce', 35, 25),
  ('Winter Brew Houze', '22 oz', 'Whipping Cream', 30, 20),
  ('Caramel Matcha', '12 oz', 'Matcha Powder', 4, 3),
  ('Caramel Matcha', '12 oz', 'Caramel Sauce', 20, 15),
  ('Caramel Matcha', '16 oz', 'Matcha Powder', 5, 4),
  ('Caramel Matcha', '16 oz', 'Caramel Sauce', 25, 20),
  ('Caramel Matcha', '22 oz', 'Matcha Powder', 7, 5),
  ('Caramel Matcha', '22 oz', 'Fresh Milk', 340, 300),
  ('Caramel Matcha', '22 oz', 'Caramel Sauce', 35, 25),
  ('Strawberry Matcha', '12 oz', 'Matcha Powder', 4, 3),
  ('Strawberry Matcha', '12 oz', 'Strawberry Syrup', 22, 15),
  ('Strawberry Matcha', '16 oz', 'Matcha Powder', 5, 4),
  ('Strawberry Matcha', '16 oz', 'Strawberry Syrup', 30, 22),
  ('Strawberry Matcha', '22 oz', 'Matcha Powder', 7, 5),
  ('Strawberry Matcha', '22 oz', 'Fresh Milk', 340, 300),
  ('Strawberry Matcha', '22 oz', 'Strawberry Syrup', 45, 30),
  ('Mocha', '12 oz', 'Espresso Shot', 2, 1),
  ('Mocha', '12 oz', 'Chocolate Sauce', 20, 15),
  ('Mocha', '16 oz', 'Espresso Shot', 2, 1),
  ('Mocha', '16 oz', 'Chocolate Sauce', 25, 20),
  ('Mocha', '22 oz', 'Espresso Shot', 3, 2),
  ('Mocha', '22 oz', 'Fresh Milk', 340, 300),
  ('Mocha', '22 oz', 'Chocolate Sauce', 35, 25),
  ('Hazelnut Latte', '12 oz', 'Espresso Shot', 2, 1),
  ('Hazelnut Latte', '12 oz', 'Hazelnut Syrup', 15, 10),
  ('Hazelnut Latte', '16 oz', 'Espresso Shot', 2, 1),
  ('Hazelnut Latte', '16 oz', 'Hazelnut Syrup', 20, 15),
  ('Hazelnut Latte', '22 oz', 'Espresso Shot', 3, 2),
  ('Hazelnut Latte', '22 oz', 'Fresh Milk', 340, 300),
  ('Hazelnut Latte', '22 oz', 'Hazelnut Syrup', 30, 20),
  ('Vanilla Hazelnut', '12 oz', 'Espresso Shot', 2, 1),
  ('Vanilla Hazelnut', '12 oz', 'Vanilla Syrup', 8, 5),
  ('Vanilla Hazelnut', '12 oz', 'Hazelnut Syrup', 8, 5),
  ('Vanilla Hazelnut', '16 oz', 'Espresso Shot', 2, 1),
  ('Vanilla Hazelnut', '16 oz', 'Vanilla Syrup', 10, 8),
  ('Vanilla Hazelnut', '16 oz', 'Hazelnut Syrup', 10, 8),
  ('Vanilla Hazelnut', '22 oz', 'Espresso Shot', 3, 2),
  ('Vanilla Hazelnut', '22 oz', 'Fresh Milk', 340, 300),
  ('Vanilla Hazelnut', '22 oz', 'Vanilla Syrup', 15, 10),
  ('Vanilla Hazelnut', '22 oz', 'Hazelnut Syrup', 15, 10),
  ('Salted Caramel', '12 oz', 'Espresso Shot', 2, 1),
  ('Salted Caramel', '12 oz', 'Salted Caramel Syrup', 15, 10),
  ('Salted Caramel', '16 oz', 'Espresso Shot', 2, 1),
  ('Salted Caramel', '16 oz', 'Salted Caramel Syrup', 20, 15),
  ('Salted Caramel', '22 oz', 'Espresso Shot', 3, 2),
  ('Salted Caramel', '22 oz', 'Fresh Milk', 340, 300),
  ('Salted Caramel', '22 oz', 'Salted Caramel Syrup', 30, 20),
  ('Thai Strawberry Espresso', '16 oz', 'Espresso Shot', 2, 1),
  ('Thai Strawberry Espresso', '16 oz', 'Strawberry Syrup', 30, 22),
  ('Thai Strawberry Espresso', '16 oz', 'Condensed Milk', 25, 20),
  ('Thai Strawberry Espresso', '22 oz', 'Espresso Shot', 3, 2),
  ('Thai Strawberry Espresso', '22 oz', 'Strawberry Syrup', 45, 30),
  ('Thai Strawberry Espresso', '22 oz', 'Condensed Milk', 35, 25),
  ('Thai Strawberry Espresso', '22 oz', 'Fresh Milk', 238, 210),
  ('Almond Milk Espresso', '16 oz', 'Espresso Shot', 2, 1),
  ('Almond Milk Espresso', '22 oz', 'Espresso Shot', 3, 2),
  ('Almond Milk Espresso', '22 oz', 'Almond Milk', 340, 300),
  ('Affogato', 'Regular', 'Espresso Shot', 2, 1),
  ('Affogato', 'Regular', 'Fior di Latte Gelato', 120, 100),
  ('Cappuccino Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Cappuccino Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Cappuccino Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Latte Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Latte Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Latte Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Salted Caramel Latte Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Salted Caramel Latte Frappe', '16 oz', 'Whipping Cream', 20, 15),
  ('Salted Caramel Latte Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Salted Caramel Latte Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Salted Caramel Latte Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('Espresso Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Espresso Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Espresso Frappe', '22 oz', 'Espresso Shot', 3, 2),
  ('Mocha Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Mocha Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Mocha Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Vanilla Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Vanilla Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Chocolate Caramel Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Chocolate Caramel Frappe', '16 oz', 'Whipping Cream', 20, 15),
  ('Chocolate Caramel Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Chocolate Caramel Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('Java Chip Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Java Chip Frappe', '16 oz', 'Whipping Cream', 20, 15),
  ('Java Chip Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Java Chip Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Java Chip Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', 'Whipping Cream', 20, 15),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Vanilla Hazelnut Oreo Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('Strawberry Choco Espresso Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Strawberry Choco Espresso Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Strawberry Choco Espresso Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Summer Brew Houze Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Summer Brew Houze Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Matcha Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Matcha Frappe', '16 oz', 'Matcha Powder', 5, 4),
  ('Matcha Frappe', '16 oz', 'Whipping Cream', 20, 15),
  ('Matcha Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Matcha Frappe', '22 oz', 'Matcha Powder', 7, 5),
  ('Matcha Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('Cheesecake Tiramisu Frappe', '16 oz', 'Frappe Base Powder', 30, 25),
  ('Cheesecake Tiramisu Frappe', '16 oz', 'Whipping Cream', 20, 15),
  ('Cheesecake Tiramisu Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Cheesecake Tiramisu Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('Cheesecake Tiramisu Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('White Winter Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('White Winter Frappe', '22 oz', 'Espresso Shot', 2, 1),
  ('White Winter Frappe', '22 oz', 'White Chocolate Sauce', 35, 25),
  ('White Winter Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('Fior di Latte Frappe', '22 oz', 'Frappe Base Powder', 40, 35),
  ('Fior di Latte Frappe', '22 oz', 'Fior di Latte Gelato', 120, 100),
  ('Fior di Latte Frappe', '22 oz', 'Whipping Cream', 30, 20),
  ('Mexicali Pizza', 'Regular', 'Pizza Sauce', 80, 70),
  ('Mexicali Pizza', 'Regular', 'Mozzarella', 120, 90),
  ('Mexicali Pizza', 'Regular', 'Ground Beef', 80, 60),
  ('Hawaiian Pizza', 'Regular', 'Pizza Sauce', 80, 70),
  ('Hawaiian Pizza', 'Regular', 'Mozzarella', 120, 90),
  ('Hawaiian Pizza', 'Regular', 'Ham', 60, 50),
  ('Hawaiian Pizza', 'Regular', 'Pineapple Tidbits', 60, 50),
  ('Pepperoni Pizza', 'Regular', 'Pizza Sauce', 80, 70),
  ('Pepperoni Pizza', 'Regular', 'Mozzarella', 120, 90),
  ('Pepperoni Pizza', 'Regular', 'Pepperoni', 60, 40),
  ('Prosciutto Pizza', 'Regular', 'Pizza Sauce', 80, 70),
  ('Prosciutto Pizza', 'Regular', 'Mozzarella', 120, 90),
  ('Prosciutto Pizza', 'Regular', 'Prosciutto', 50, 30),
  ('Margherita Pizza', 'Regular', 'Pizza Sauce', 90, 80),
  ('Margherita Pizza', 'Regular', 'Mozzarella', 150, 110),
  ('Double Decker Brew Houze', 'Regular', 'Pizza Sauce', 150, 130),
  ('Double Decker Brew Houze', 'Regular', 'Mozzarella', 220, 170),
  ('Double Decker Brew Houze', 'Regular', 'Pepperoni', 50, 30),
  ('Double Decker Brew Houze', 'Regular', 'Ham', 50, 40),
  ('Double Decker Brew Houze', 'Regular', 'Ground Beef', 60, 40),
  ('Clubhouse with Fries', 'Regular', 'Chicken Breast', 60, 40),
  ('Clubhouse with Fries', 'Regular', 'Ham', 40, 30),
  ('Clubhouse with Fries', 'Regular', 'Bacon', 30, 20),
  ('Clubhouse with Fries', 'Regular', 'Potatoes', 150, 120),
  ('Clubhouse with Fries', 'Regular', 'Cooking Oil', 30, 25),
  ('Marinara', 'Regular', 'Spaghetti Noodles', 120, 100),
  ('Carbonara', 'Regular', 'Spaghetti Noodles', 120, 100),
  ('Carbonara', 'Regular', 'All-Purpose Cream', 150, 120),
  ('Carbonara', 'Regular', 'Bacon', 40, 30),
  ('Carbonara', 'Regular', 'Parmesan', 15, 10),
  ('Spaghetti', 'Regular', 'Spaghetti Noodles', 120, 100),
  ('Pesto', 'Regular', 'Spaghetti Noodles', 120, 100),
  ('Pesto', 'Regular', 'Pesto Sauce', 50, 40),
  ('Pesto', 'Regular', 'Parmesan', 15, 10),
  ('Nachos', 'Regular', 'Tortilla Chips', 120, 100),
  ('Nachos', 'Regular', 'Cheese Sauce', 60, 50),
  ('Nachos', 'Regular', 'Ground Beef', 50, 40),
  ('Sizzling Beef Mushroom', 'With Rice', 'Beef Sirloin', 120, 100),
  ('Sizzling Beef Mushroom', 'With Rice', 'Button Mushrooms', 50, 40),
  ('Sizzling Beef Mushroom', 'Ala Carte', 'Beef Sirloin', 180, 150),
  ('Sizzling Beef Mushroom', 'Ala Carte', 'Button Mushrooms', 75, 60),
  ('Pigar-Pigar', 'Ala Carte', 'Beef Sirloin', 200, 150);

UPDATE variant_ingredients vi
SET required_quantity = f.new_qty
FROM fix_recipes f
JOIN products p ON p.product_name = f.product_name AND p.is_archived = FALSE
JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE AND LOWER(TRIM(pv.size_label)) = LOWER(f.size_label)
JOIN inventory i ON i.item_name = f.item_name AND i.is_archived = FALSE
WHERE vi.product_variant_id = pv.product_variant_id
  AND vi.inventory_id = i.inventory_id
  AND vi.required_quantity = f.old_qty;

COMMIT;
