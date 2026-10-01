-- Stock write-off fix migration
--
-- The rule added by stock-write-off-migration.sql let a write-off through with no reason: an
-- empty reason makes the reason test unknown instead of false, and a CHECK rule only refuses
-- false. The reason test now counts an empty reason as false, so every write-off must say why.
-- Nothing else changes, and no existing row breaks the rule (the apps always send a reason).
--
-- Run in the Supabase SQL editor. Written so it also runs in consoles that split scripts on every
-- semicolon: no semicolons or quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE inventory_log DROP CONSTRAINT IF EXISTS inventory_log_write_off_check;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_write_off_check CHECK (
  (change_type = 'written_off' AND COALESCE(write_off_reason IN ('expired', 'damaged', 'wasted', 'in_house', 'other'), FALSE) AND quantity_delta < 0 AND (write_off_cost IS NULL OR write_off_cost >= 0))
  OR (change_type <> 'written_off' AND write_off_reason IS NULL AND write_off_cost IS NULL)
);
