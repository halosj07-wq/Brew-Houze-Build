-- Counter carts migration (mobile ID discounts, part 2)
--
-- A mobile customer with a senior, PWD or other discount ID sends their cart to the counter
-- (counter_carts, made by id-discounts-migration.sql). The cashier checks the ID and takes
-- payment. When they pay with GCash at the counter, the payment has to remember which sent cart it
-- is for, so the cart is marked done and the phone can follow the order once it is paid.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS counter_cart_id INTEGER REFERENCES counter_carts(counter_cart_id) ON DELETE SET NULL;
