-- Clear finance history: a fresh start for sales, shifts and the safe
--
-- DELETES FOR GOOD, with no undo:
--   sales       sales_orders, sales_order_items, sales_order_item_additions, order_discounts,
--               order_stations (bar and kitchen tickets), payment_checkouts (GCash payments),
--               counter_carts (orders waiting at the counter), deliveries, id_verifications
--   shifts      shifts, cash_movements (cash drawer entries), employee_time_logs (attendance)
--   treasury    treasury_entries (the safe history). The safe stays, back to not started.
--   expenses    expenses (added after this file first ran)
--   waste       write_off_requests (waste reports from the staff app, added later too)
--   loyalty     loyalty_star_entries (stars earned and spent), loyalty_claims,
--               loyalty_birthday_claims, all made by the orders above
--   stock       inventory_log (stock history). Stock on hand stays as it is now.
--
-- KEEPS: accounts and employees, the menu, add-ons and recipes, inventory and its packages
-- (current quantities and costs), customers and their addresses, loyalty campaigns and rewards,
-- discount types, delivery zones, store settings, sign-ins.
--
-- Customers keep their accounts but start again at 0 stars, as their stars came from the orders
-- above. Numbering restarts from 1 (order numbers, shift numbers and so on).
-- No CASCADE: if any table not listed here still pointed at these, Postgres refuses the whole
-- statement instead of emptying something else.
--
-- Run in the Supabase SQL editor while the store is closed (no shift open).
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

TRUNCATE TABLE
  write_off_requests,
  expenses,
  treasury_entries,
  cash_movements,
  loyalty_star_entries,
  loyalty_claims,
  loyalty_birthday_claims,
  inventory_log,
  order_stations,
  order_discounts,
  deliveries,
  payment_checkouts,
  id_verifications,
  counter_carts,
  sales_order_item_additions,
  sales_order_items,
  sales_orders,
  employee_time_logs,
  shifts
RESTART IDENTITY;

-- The safe goes back to not started: count it and enter its opening balance in Treasury.
UPDATE treasury_accounts SET balance = 0, opened_at = NULL, updated_at = CURRENT_TIMESTAMP;
