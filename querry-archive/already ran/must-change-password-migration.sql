-- Temporary passwords must be changed on first sign-in
--
-- When the admin gives someone a password (a new employee, a customer login made at the counter,
-- or "Give a temporary password" on the Security page), the account is flagged. After signing in
-- with it, the person must choose their own password before they can use the Staff Portal or
-- their Mobile Menu account; the server refuses everything else until then. Choosing their own
-- password (or resetting it with an emailed link) clears the flag.
--
-- The other choice on the Security page, "Email a reset link", does not use this: the person picks
-- the password themselves, and the admin never sees it.
--
-- Run in the Supabase SQL editor on both databases (Build and the café). Safe to run again.

BEGIN;

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
