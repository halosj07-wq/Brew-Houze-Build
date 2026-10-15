-- Offline orders migration: counter orders taken while the cafe had no internet
--
-- When the Staff Portal cannot reach the server, the counter tablet keeps taking cash orders and
-- saves them on the tablet, each with an offline ticket (OFF-1, OFF-2...). Once the internet is
-- back they are sent to the server and saved as ordinary sales, at the time they were taken.
--
-- 1. sales_orders.offline_id: the id the tablet gave the order. Unique, so an order sent twice
--    (the connection dropped while it was being sent) is only saved once.
-- 2. sales_orders.offline_ticket: the ticket printed on its receipt, to match the paper with the
--    sale. Empty for ordinary orders.
--
-- Run in the Supabase SQL editor (Build and the cafe database).
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS offline_id UUID;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS offline_ticket TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_offline_id_key ON sales_orders (offline_id) WHERE offline_id IS NOT NULL;
