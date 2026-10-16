-- Brew Houze menu prices: sets every size's price from the menu boards in the café
--
-- Run after product-list-2026.sql. Only changes prices: drinks, sizes and recipes stay as they
-- are. A "Hot/Iced" price applies to both the hot and the iced size. Each drink also shows its
-- new lowest price.
--
-- Not changed (not on the boards, or not in the system):
--   Biscoffee and Thai Strawberry hot 12 oz, and the Butterscotch, Matcha Cereal, Cereal Cookies
--   and Strawberry frappes keep their placeholder prices. Fior De Latte, White Winter, Affogato
--   and the alcohol versions (2 shots, 160) are on the boards but not in the system yet.
--
-- Run the whole script in the Supabase SQL editor. Safe to run again.

BEGIN;

-- product, size, hot or cold (NULL = both), price
CREATE TEMP TABLE menu_prices (product_name TEXT, size_label TEXT, temperature TEXT, price NUMERIC) ON COMMIT DROP;
INSERT INTO menu_prices VALUES
  -- Classics: hot 8 and 12 oz, hot/iced 16 and 22 oz
  ('Americano', '8 oz', 'hot', 65), ('Americano', '12 oz', 'hot', 80), ('Americano', '16 oz', NULL, 90), ('Americano', '22 oz', NULL, 110),
  ('Espresso', '8 oz', 'hot', 65), ('Espresso', '12 oz', 'hot', 80), ('Espresso', '16 oz', NULL, 90), ('Espresso', '22 oz', NULL, 110),
  ('Macchiato', '8 oz', 'hot', 100), ('Macchiato', '12 oz', 'hot', 110), ('Macchiato', '16 oz', NULL, 120), ('Macchiato', '22 oz', NULL, 130),
  ('Cappuccino', '8 oz', 'hot', 100), ('Cappuccino', '12 oz', 'hot', 110), ('Cappuccino', '16 oz', NULL, 120), ('Cappuccino', '22 oz', NULL, 135),
  ('Latte', '8 oz', 'hot', 100), ('Latte', '12 oz', 'hot', 110), ('Latte', '16 oz', NULL, 120), ('Latte', '22 oz', NULL, 135),
  ('Flat White', '8 oz', 'hot', 100), ('Flat White', '12 oz', 'hot', 110), ('Flat White', '16 oz', NULL, 120), ('Flat White', '22 oz', NULL, 130),
  ('Spanish Latte', '8 oz', 'hot', 100), ('Spanish Latte', '12 oz', 'hot', 110), ('Spanish Latte', '16 oz', NULL, 120), ('Spanish Latte', '22 oz', NULL, 135),

  -- Especials: hot 12 oz, hot/iced 16 and 22 oz
  ('Mocha', '12 oz', 'hot', 110), ('Mocha', '16 oz', NULL, 120), ('Mocha', '22 oz', NULL, 130),
  ('Choco Caramel', '12 oz', 'hot', 110), ('Choco Caramel', '16 oz', NULL, 120), ('Choco Caramel', '22 oz', NULL, 130),
  ('Vanilla Latte', '12 oz', 'hot', 110), ('Vanilla Latte', '16 oz', NULL, 130), ('Vanilla Latte', '22 oz', NULL, 140),
  ('Hazelnut', '12 oz', 'hot', 110), ('Hazelnut', '16 oz', NULL, 120), ('Hazelnut', '22 oz', NULL, 130),
  ('Vanilla Hazelnut', '12 oz', 'hot', 110), ('Vanilla Hazelnut', '16 oz', NULL, 125), ('Vanilla Hazelnut', '22 oz', NULL, 135),
  ('Salted Caramel', '12 oz', 'hot', 110), ('Salted Caramel', '16 oz', NULL, 130), ('Salted Caramel', '22 oz', NULL, 140),
  ('Caramel Macchiato', '12 oz', 'hot', 110), ('Caramel Macchiato', '16 oz', NULL, 125), ('Caramel Macchiato', '22 oz', NULL, 135),
  ('Winter Brew', '12 oz', 'hot', 110), ('Winter Brew', '16 oz', NULL, 120), ('Winter Brew', '22 oz', NULL, 130),
  ('Tropical Brew', '12 oz', 'hot', 110), ('Tropical Brew', '16 oz', NULL, 120), ('Tropical Brew', '22 oz', NULL, 130),
  ('Marocchino', '12 oz', 'hot', 110), ('Marocchino', '16 oz', NULL, 120), ('Marocchino', '22 oz', NULL, 130),
  ('Matcha', '12 oz', 'hot', 110), ('Matcha', '16 oz', NULL, 130), ('Matcha', '22 oz', NULL, 140),
  ('Caramel Matcha', '12 oz', 'hot', 110), ('Caramel Matcha', '16 oz', NULL, 135), ('Caramel Matcha', '22 oz', NULL, 145),
  ('Strawberry Matcha', '12 oz', 'hot', 110), ('Strawberry Matcha', '16 oz', NULL, 135), ('Strawberry Matcha', '22 oz', NULL, 145),
  ('Thai Strawberry', '16 oz', NULL, 130), ('Thai Strawberry', '22 oz', NULL, 140),
  ('Biscoffee', '16 oz', NULL, 150), ('Biscoffee', '22 oz', NULL, 170),
  ('S''mores', '22 oz', NULL, 180),

  -- Frappe: 16 and 22 oz
  ('Espresso Frappe', '16 oz', 'cold', 110), ('Espresso Frappe', '22 oz', 'cold', 125),
  ('Cappuccino Frappe', '16 oz', 'cold', 120), ('Cappuccino Frappe', '22 oz', 'cold', 135),
  ('Latte Frappe', '16 oz', 'cold', 120), ('Latte Frappe', '22 oz', 'cold', 135),
  ('Mocha Frappe', '16 oz', 'cold', 125), ('Mocha Frappe', '22 oz', 'cold', 135),
  ('Vanilla Frappe', '16 oz', 'cold', 125), ('Vanilla Frappe', '22 oz', 'cold', 135),
  ('Chocolate Caramel Frappe', '16 oz', 'cold', 135), ('Chocolate Caramel Frappe', '22 oz', 'cold', 145),
  ('Salted Caramel Frappe', '16 oz', 'cold', 135), ('Salted Caramel Frappe', '22 oz', 'cold', 145),

  -- Especial Frappe: 16 and 22 oz
  ('Java Chip Frappe', '16 oz', 'cold', 135), ('Java Chip Frappe', '22 oz', 'cold', 145),
  ('Marocchino Frappe', '16 oz', 'cold', 130), ('Marocchino Frappe', '22 oz', 'cold', 140),
  ('Strawberry Chocolate Frappe', '16 oz', 'cold', 130), ('Strawberry Chocolate Frappe', '22 oz', 'cold', 140),
  ('Vanilla Hazelnut Frappe', '16 oz', 'cold', 130), ('Vanilla Hazelnut Frappe', '22 oz', 'cold', 140),
  ('Vanilla Hazelnut Oreo Frappe', '16 oz', 'cold', 135), ('Vanilla Hazelnut Oreo Frappe', '22 oz', 'cold', 145),
  ('Summer Brew Houze Frappe', '16 oz', 'cold', 130), ('Summer Brew Houze Frappe', '22 oz', 'cold', 140),
  ('Cheesecake Tiramisu Frappe', '16 oz', 'cold', 130), ('Cheesecake Tiramisu Frappe', '22 oz', 'cold', 140),
  ('Matcha Frappe', '16 oz', 'cold', 135), ('Matcha Frappe', '22 oz', 'cold', 145),
  ('Strawberry Matcha Frappe', '16 oz', 'cold', 135), ('Strawberry Matcha Frappe', '22 oz', 'cold', 145),
  ('Caramel Matcha Frappe', '16 oz', 'cold', 135), ('Caramel Matcha Frappe', '22 oz', 'cold', 145),
  ('Almond Milk Frappe', '16 oz', 'cold', 135), ('Almond Milk Frappe', '22 oz', 'cold', 145),
  ('Biscoffee Frappe', '16 oz', 'cold', 180), ('Biscoffee Frappe', '22 oz', 'cold', 190),
  ('S''mores Frappe', '22 oz', 'cold', 190),
  ('Dark Roast Pastry Frappe', '22 oz', 'cold', 150),
  ('Snickers Fudge Frappe', '22 oz', 'cold', 190),

  -- Ice Teas / Mojito: 16 and 22 oz
  ('Honey Blend Iced Tea', '16 oz', 'cold', 75), ('Honey Blend Iced Tea', '22 oz', 'cold', 95),
  ('Vanilla Fruity Iced Tea', '16 oz', 'cold', 85), ('Vanilla Fruity Iced Tea', '22 oz', 'cold', 105),
  ('Peach Mango Iced Tea', '16 oz', 'cold', 85), ('Peach Mango Iced Tea', '22 oz', 'cold', 105),
  ('Lychee Iced Tea', '16 oz', 'cold', 85), ('Lychee Iced Tea', '22 oz', 'cold', 105),
  ('Green Apple Iced Tea', '16 oz', 'cold', 85), ('Green Apple Iced Tea', '22 oz', 'cold', 105),
  ('Citrus Blend Iced Tea', '16 oz', 'cold', 95), ('Citrus Blend Iced Tea', '22 oz', 'cold', 120),
  ('Strawberry Mojito', '16 oz', 'cold', 105), ('Strawberry Mojito', '22 oz', 'cold', 125),
  ('Virgin Mojito', '16 oz', 'cold', 95), ('Virgin Mojito', '22 oz', 'cold', 120),
  ('Lemon Ginger Mojito', '16 oz', 'cold', 95), ('Lemon Ginger Mojito', '22 oz', 'cold', 120),
  ('Lemon Mojito', '16 oz', 'cold', 95), ('Lemon Mojito', '22 oz', 'cold', 120),
  ('Passion Fruit Mojito', '16 oz', 'cold', 95), ('Passion Fruit Mojito', '22 oz', 'cold', 120),
  ('Blueberry Mojito', '16 oz', 'cold', 105), ('Blueberry Mojito', '22 oz', 'cold', 125);

-- Stop (nothing changed) if a price on the boards has no matching drink and size
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(m.product_name || ' ' || m.size_label, ', ') INTO missing
  FROM menu_prices m
  WHERE NOT EXISTS (
    SELECT 1 FROM product_variants pv JOIN products p ON p.product_id = pv.product_id AND p.is_archived = FALSE
    WHERE p.product_name = m.product_name AND pv.is_archived = FALSE
      AND LOWER(TRIM(pv.size_label)) = LOWER(m.size_label) AND (m.temperature IS NULL OR pv.temperature = m.temperature)
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'These are not in the menu yet (run product-list-2026.sql first): %', missing;
  END IF;
END $$;

UPDATE product_variants pv
SET price = m.price, updated_at = CURRENT_TIMESTAMP
FROM menu_prices m, products p
WHERE p.product_id = pv.product_id AND p.is_archived = FALSE AND pv.is_archived = FALSE
  AND p.product_name = m.product_name
  AND LOWER(TRIM(pv.size_label)) = LOWER(m.size_label)
  AND (m.temperature IS NULL OR pv.temperature = m.temperature);

-- Each drink shows its lowest price
UPDATE products p
SET price = (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_archived = FALSE), updated_at = CURRENT_TIMESTAMP
WHERE p.is_archived = FALSE
  AND EXISTS (SELECT 1 FROM menu_prices m WHERE m.product_name = p.product_name);

COMMIT;
