-- Close shift permission migration
--
-- Closing the shift (counting the drawer, signing everyone out, ending the business day) gets its
-- own permission, separate from opening the store. Admins can always close it, baristas never.
--
-- Until now any cashier could close the shift, so existing accounts keep that ability (the
-- column is added with TRUE for them). New employees start without it. Switch it off per
-- cashier in Accounts and Employees.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS can_close_shift BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admin_users ALTER COLUMN can_close_shift SET DEFAULT FALSE;
