-- Development reset: empties every table except accounts (admin_users)
--
-- DELETES FOR GOOD, with no undo:
--   menu        products, product_variants, variant_ingredients, product_ingredients,
--               product_categories, additions, product_additions
--   inventory   inventory, inventory_packaging, inventory_log (stock history)
--   sales       sales_orders, sales_order_items, sales_order_item_additions, payment_checkouts
--   operations  shifts, employee_time_logs (attendance)
--   sign-ins    user_sessions (everyone is signed out), password_reset_tokens
--
-- KEEPS: admin_users (every admin and cashier account, with its password and permissions).
--
-- Numbering restarts from 1 (order numbers, shift numbers and so on).
-- No CASCADE: if any other table still pointed at these, Postgres refuses the whole statement
-- instead of emptying something not listed here, so accounts cannot be touched.
--
-- Run in the Supabase SQL editor. Only for development data. Safe to run more than once.

TRUNCATE TABLE
  sales_order_item_additions,
  sales_order_items,
  payment_checkouts,
  sales_orders,
  inventory_log,
  employee_time_logs,
  shifts,
  product_additions,
  additions,
  variant_ingredients,
  product_ingredients,
  product_variants,
  products,
  product_categories,
  inventory_packaging,
  inventory,
  user_sessions,
  password_reset_tokens
RESTART IDENTITY;
