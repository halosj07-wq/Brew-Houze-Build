-- Stock write-off migration (waste and in-house use)
--
-- Stock that leaves without being sold: expired or spoiled, damaged, spilled or wasted, or used
-- in-house (staff drinks, tasting, testing a recipe). Until now the only way to lower stock was a
-- hand edit after a count, and its cost showed up nowhere. Now it is written off:
--
-- 1. inventory_log gets a new change type, written_off, and two columns:
--      write_off_reason  expired, damaged, wasted, in_house or other (what happened in the note)
--      write_off_cost    what the stock written off was worth at its cost then (quantity times
--                        unit cost). Null when the item has no cost set.
--    The entry keeps the shift (as every stock change does), so Finance counts it on that
--    business day, or on the calendar day when no shift was open.
--
-- 2. Finance shows the stock written off as a cost of its own, and net profit takes it off too:
--      gross profit - PayMongo fees - expenses - stock written off = net profit
--    It is not an expense: no money was paid out, the cost was paid when the stock was bought.
--
-- A hand edit after a count stays as it was (manual_edit) for correcting a miscount.
--
-- Run in the Supabase SQL editor before deploying the matching admin app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE inventory_log DROP CONSTRAINT IF EXISTS inventory_log_change_type_check;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_change_type_check CHECK (change_type IN (
  'created', 'restocked', 'manual_edit', 'order_deduction',
  'void_restore', 'refund_restore', 'deleted',
  'archived', 'restored', 'purged', 'cost_updated', 'written_off'
));

ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS write_off_reason TEXT;
ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS write_off_cost NUMERIC(12, 2);

ALTER TABLE inventory_log DROP CONSTRAINT IF EXISTS inventory_log_write_off_check;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_write_off_check CHECK (
  (change_type = 'written_off' AND write_off_reason IN ('expired', 'damaged', 'wasted', 'in_house', 'other') AND quantity_delta < 0 AND (write_off_cost IS NULL OR write_off_cost >= 0))
  OR (change_type <> 'written_off' AND write_off_reason IS NULL AND write_off_cost IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_inventory_log_written_off ON inventory_log (created_at) WHERE change_type = 'written_off';
