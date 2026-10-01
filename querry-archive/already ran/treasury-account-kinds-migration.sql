-- Treasury account kinds migration
--
-- treasury_accounts.kind allowed safe, bank and ewallet. Brew Houze does not track a bank in the
-- system, so the kinds are now only:
--   safe     the cash box (the Safe)
--   ewallet  money held online for the cafe, for example its PayMongo balance (phase 2)
-- No rows change: the only account is the Safe.
--
-- Run in the Supabase SQL editor. Written so it also runs in consoles that split scripts on every
-- semicolon: no semicolons or quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE treasury_accounts DROP CONSTRAINT IF EXISTS treasury_accounts_kind_check;
ALTER TABLE treasury_accounts ADD CONSTRAINT treasury_accounts_kind_check CHECK (kind IN ('safe', 'ewallet'));
