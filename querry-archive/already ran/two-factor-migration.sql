-- Two-step sign-in: a 6-digit code emailed on a new device
--
-- Every sign-in (admin portal, Staff Portal, mobile menu) checks the password first. On a device
-- the account has not used in the last 30 days, a 6-digit code is emailed to the account and must
-- be typed before the session starts. The device is then trusted for that account for 30 days.
--
-- 1. login_challenges: one per sign-in waiting for its code. Only hashes are stored: the hash of
--    the challenge token (kept by the browser) and of the code. A code lasts 10 minutes, allows 5
--    wrong tries, and can be resent 3 times.
-- 2. trusted_devices: a device (a random id in a cookie, hashed here) trusted by one account. One
--    device can be trusted by several accounts, so cashiers sharing the counter tablet each verify
--    once. Resetting a password removes that account from every trusted device.
--
-- account_kind is staff (admin_users, used by the admin portal and the Staff Portal) or customer
-- (customers, used by the mobile menu).
--
-- Run in the Supabase SQL editor. Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS login_challenges (
  challenge_id SERIAL PRIMARY KEY,
  account_kind TEXT NOT NULL CHECK (account_kind IN ('staff', 'customer')),
  account_id INTEGER NOT NULL,
  portal TEXT NOT NULL CHECK (portal IN ('admin', 'staff', 'mobile')),
  token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sends INTEGER NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_challenges_account ON login_challenges (account_kind, account_id, created_at);

CREATE TABLE IF NOT EXISTS trusted_devices (
  trusted_id SERIAL PRIMARY KEY,
  account_kind TEXT NOT NULL CHECK (account_kind IN ('staff', 'customer')),
  account_id INTEGER NOT NULL,
  device_hash TEXT NOT NULL,
  device_label TEXT,
  trusted_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_kind, account_id, device_hash)
);

ALTER TABLE login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

COMMIT;
