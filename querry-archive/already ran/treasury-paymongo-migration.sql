-- Treasury migration, phase 2: the PayMongo page and payment fees
--
-- GCash payments go through PayMongo, which keeps a fee on each one (2.5 percent for GCash on
-- this account) and pays the rest out once a week. Until now the system only knew the full
-- amount the customer paid. Now:
--
-- 1. sales_orders.payment_fee: the fee PayMongo kept on the GCash part of the order, read from
--    PayMongo when the payment is confirmed. Null for cash and cash on delivery orders. A voided
--    or refunded GCash order keeps its fee, because PayMongo keeps it too (the money goes back
--    to the customer by hand from the cafe GCash, not through PayMongo).
--
-- 2. A second treasury account, PayMongo (kind ewallet): the logbook of the money PayMongo is
--    holding for the cafe. It should match the upcoming payout balance on the PayMongo
--    dashboard. Like the safe, it is not used until an admin enters its opening balance.
--
-- 3. Three new kinds of treasury entry:
--      gcash_sales   closing: the GCash paid through PayMongo in the shift        plus
--      gateway_fee   closing: the fees PayMongo kept on those payments            minus
--      payout        PayMongo paid the balance out to the owner                   minus
--    gcash_sales and gateway_fee name their shift. A payout is recorded by the admin when it
--    arrives. A check against the PayMongo dashboard uses the existing correction kind.
--
-- The cash drawer, net sales and the safe do not change.
--
-- Run in the Supabase SQL editor before deploying the matching app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_fee NUMERIC(10, 2) CHECK (payment_fee >= 0);

-- One account per name.
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_account_name ON treasury_accounts (LOWER(name));

INSERT INTO treasury_accounts (name, kind)
SELECT 'PayMongo', 'ewallet'
WHERE NOT EXISTS (SELECT 1 FROM treasury_accounts WHERE LOWER(name) = 'paymongo');

ALTER TABLE treasury_entries DROP CONSTRAINT IF EXISTS treasury_entries_kind_check;
ALTER TABLE treasury_entries ADD CONSTRAINT treasury_entries_kind_check CHECK (kind IN ('opening_balance', 'deposit', 'withdrawal', 'float_out', 'float_return', 'shift_deposit', 'cash_drop', 'cash_top_up', 'correction', 'gcash_sales', 'gateway_fee', 'payout'));

ALTER TABLE treasury_entries DROP CONSTRAINT IF EXISTS treasury_entries_direction;
ALTER TABLE treasury_entries ADD CONSTRAINT treasury_entries_direction CHECK (
  (kind = 'opening_balance' AND amount >= 0)
  OR (kind IN ('deposit', 'float_return', 'shift_deposit', 'cash_drop', 'gcash_sales') AND amount > 0)
  OR (kind IN ('withdrawal', 'float_out', 'cash_top_up', 'gateway_fee', 'payout') AND amount < 0)
  OR (kind = 'correction' AND amount <> 0)
);

ALTER TABLE treasury_entries DROP CONSTRAINT IF EXISTS treasury_entries_shift;
ALTER TABLE treasury_entries ADD CONSTRAINT treasury_entries_shift CHECK (kind NOT IN ('float_out', 'float_return', 'shift_deposit', 'cash_drop', 'cash_top_up', 'gcash_sales', 'gateway_fee') OR shift_id IS NOT NULL);
