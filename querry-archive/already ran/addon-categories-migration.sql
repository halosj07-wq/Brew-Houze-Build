-- Add-on categories: limit an add-on to some menu categories
--
-- addition_categories lists the categories an add-on may go on, for example Extra Rice only on
-- Rice Meals and Sizzling. An add-on with no categories goes on every item of its station (bar or
-- kitchen), as before. The Staff Portal and the mobile menu only offer an add-on on items of its
-- categories, and checkout refuses anything else. Renaming a category keeps its add-ons, and
-- archiving one removes it from them.
--
-- The six food add-ons get categories to start with. Drink add-ons stay open to every drink.
--
-- Run in the Supabase SQL editor. Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS addition_categories (
  addition_id INTEGER NOT NULL REFERENCES additions(addition_id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES product_categories(category_id) ON DELETE CASCADE,
  PRIMARY KEY (addition_id, category_id)
);
ALTER TABLE addition_categories ENABLE ROW LEVEL SECURITY;

INSERT INTO addition_categories (addition_id, category_id)
SELECT a.addition_id, c.category_id
FROM (VALUES
  ('Extra Rice', 'Rice Meals'), ('Extra Rice', 'Sizzling'),
  ('Extra Egg', 'Rice Meals'), ('Extra Egg', 'Sizzling'), ('Extra Egg', 'Sandwiches'),
  ('Extra Cheese', 'Pizza'), ('Extra Cheese', 'Pasta'), ('Extra Cheese', 'Sandwiches'),
  ('Extra Bacon', 'Pizza'), ('Extra Bacon', 'Pasta'), ('Extra Bacon', 'Sandwiches'),
  ('Extra Gravy', 'Sizzling'), ('Extra Gravy', 'Rice Meals'),
  ('Extra Cheese Sauce', 'Snacks')
) AS seed(addition_name, category_name)
JOIN additions a ON LOWER(a.addition_name) = LOWER(seed.addition_name) AND a.is_active = TRUE
JOIN product_categories c ON c.category_name = seed.category_name
ON CONFLICT DO NOTHING;

COMMIT;
