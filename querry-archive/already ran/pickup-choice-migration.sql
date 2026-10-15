-- Pickup choice migration: each order can choose how its drinks and food are picked up
--
-- 1. sales_orders.pickup_mode: together (the number is called once, when every part is ready)
--    or separate (drinks and food are called and picked up on their own), as the order chose.
--    Empty for orders that did not choose: they follow the store setting.
-- 2. payment_checkouts.pickup_mode and counter_carts.pickup_mode: the same choice, kept while a
--    GCash payment is waiting or a cart sent from the mobile menu waits at the counter, so the
--    order made from it gets it.
-- 3. store_settings.pickup_mode can now also be per_order: each order chooses at checkout (the
--    Staff Portal and the mobile menu ask only when an order has drinks and food and is not a
--    delivery). Set in Admin, Menu, Pickup. Nothing changes until Admin picks it.
--
-- Run in the Supabase SQL editor before letting each order choose.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS pickup_mode TEXT;
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_pickup_mode_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_pickup_mode_check CHECK (pickup_mode IS NULL OR pickup_mode IN ('together', 'separate'));

ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS pickup_mode TEXT;
ALTER TABLE payment_checkouts DROP CONSTRAINT IF EXISTS payment_checkouts_pickup_mode_check;
ALTER TABLE payment_checkouts ADD CONSTRAINT payment_checkouts_pickup_mode_check CHECK (pickup_mode IS NULL OR pickup_mode IN ('together', 'separate'));

ALTER TABLE counter_carts ADD COLUMN IF NOT EXISTS pickup_mode TEXT;
ALTER TABLE counter_carts DROP CONSTRAINT IF EXISTS counter_carts_pickup_mode_check;
ALTER TABLE counter_carts ADD CONSTRAINT counter_carts_pickup_mode_check CHECK (pickup_mode IS NULL OR pickup_mode IN ('together', 'separate'));
