-- Security log and staff sign-in lockout
--
-- security_events: one row for everything that matters to account security, in all three apps:
-- sign-ins (successful, wrong password, refused), lockouts and unlocks, new-device codes,
-- password changes and resets, and the admin's changes to employee accounts (added, role,
-- permissions, deactivated, signed out everywhere). The admin reads it on the Security page.
--
-- It also drives the staff lockout: 5 wrong passwords for one email (Admin Portal and Staff Portal
-- together) within 15 minutes lock that email for 15 minutes. A successful sign-in, a password
-- reset, a password set by the admin, or the admin's Unlock starts the count again. Customers
-- keep their own lockout (customer_login_failures); their sign-ins are logged here too.
--
--   event          what happened (login_success, login_failed, account_locked, password_changed, ...)
--   portal         admin, staff or mobile (the app it happened in)
--   account_kind   staff (admin_users) or customer (customers), when the account is known
--   login_key      the email or username typed at sign-in, lowercased (what the lockout counts)
--   actor_admin_id the admin who made the change, for changes made to someone else's account
--   ip, device     where it came from ("Android · Chrome")
--
-- Run in the Supabase SQL editor on both databases (Build and the café). Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS security_events (
  event_id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  portal TEXT CHECK (portal IN ('admin', 'staff', 'mobile')),
  account_kind TEXT CHECK (account_kind IN ('staff', 'customer')),
  account_id INTEGER,
  login_key TEXT,
  actor_admin_id INTEGER,
  detail TEXT,
  ip TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_security_events_login ON security_events (login_key, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_account ON security_events (account_kind, account_id, created_at);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

COMMIT;
