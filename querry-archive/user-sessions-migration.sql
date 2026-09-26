-- User sessions migration
--
-- Remembers every signed-in device, so the apps can tell whether a login is still valid:
--   * several devices per account are allowed (admin on a tablet and a phone)
--   * cashier attendance ends only when the person signs out of their last cashier-app device
--   * closing a shift signs everyone out of the cashier app (next shift must sign in again)
--   * a password reset, or an admin, can sign an account out of every device
--
-- The cookie carries a random session id. Only a SHA-256 hash of it is stored here.
-- Sessions that existed before this migration are not recognised, so everyone signs in once
-- after deploying the matching app code.
--
-- Written so it also runs in SQL consoles that split scripts on every semicolon: no
-- semicolons or quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('admin', 'cashier')),
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('signed_out', 'shift_closed', 'password_reset', 'signed_out_by_admin'))
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions (admin_id, app)
  WHERE ended_at IS NULL;
