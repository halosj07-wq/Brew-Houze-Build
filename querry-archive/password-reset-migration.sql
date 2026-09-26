-- Password reset migration
--
-- Supports "Forgot password?" on the admin and cashier login screens. A reset link is emailed
-- to the address of the account. Only a SHA-256 hash of the link token is stored, so a copy of
-- the database cannot be used to reset anyone. Each link works once and expires after 30 minutes.
--
-- Also makes account emails unique (ignoring letter case), since a reset email must lead to
-- exactly one account.
--
-- Written so it also runs in SQL consoles that split scripts on every semicolon: no
-- semicolons or quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_admin_created
  ON password_reset_tokens (admin_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_lower_unique_idx
  ON admin_users (LOWER(email));
