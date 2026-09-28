-- Dine in / Take out migration
--
-- Every order records whether it is eaten at the café (dine_in) or taken away (take_out). The
-- cashier picks it in the staff app and the customer in the mobile menu cart. The barista sees it
-- on the queue ticket (mug or cup), and it prints on the receipt and shows in Finance.
-- Orders placed before this migration have no value (shown as not recorded).
-- A GCash payment remembers the choice until it is paid and the order is created.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS service_type TEXT CHECK (service_type IS NULL OR service_type IN ('dine_in', 'take_out'));
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS service_type TEXT CHECK (service_type IS NULL OR service_type IN ('dine_in', 'take_out'));