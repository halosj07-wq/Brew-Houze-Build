-- Treasury migration (phase 1: the safe)
--
-- Where the business money lives between shifts. Until now the starting cash of a shift was typed
-- in fresh, the counted cash at closing went nowhere, and a cash drop had no destination. Now:
--
-- 1. treasury_accounts: the places the money is kept. Phase 1 has one, the Safe. Money held
--    online for the cafe, such as its PayMongo balance, comes later (kind ewallet) without
--    changing these tables.
--    balance is the running balance, kept by the apps in the same transaction as each entry.
--    opened_at is when the admin counted the safe and entered its opening balance (go live).
--    Until then shifts work as before and nothing touches the safe.
--
-- 2. treasury_entries: the history of every peso in or out of an account, like a ledger.
--    amount is signed (plus into the account, minus out of it) and balance_after is the balance
--    right after it. Entries are never edited or deleted: a mistake is fixed with a correction.
--      opening_balance  the counted safe at go live (once per account, may be 0)
--      deposit          the owner puts money in                       plus
--      withdrawal       the owner takes money out                     minus
--      float_out        a shift opens with more cash than was left in the drawer: the rest
--                       comes from the safe                           minus
--      float_return     a shift opens with less cash than was left in the drawer: the rest
--                       goes back to the safe                         plus
--      shift_deposit    closing: the counted cash not kept as the next float   plus
--      cash_drop        a cash drop during a shift (cash_movements)    plus
--      cash_top_up      cash added to the drawer during a shift (cash_movements cash_in),
--                       taken from the safe                           minus
--      correction       fixes a mistake                                plus or minus
--    shift_id links the moves made by a shift, movement_id the drawer movement behind a cash
--    drop or top up, corrects_entry_id the entry a correction fixes.
--
-- 3. shifts.carried_float: cash already in the drawer when the shift opened (left by the shift
--    before). shifts.float_kept: cash the closer left in the drawer for the next shift. The rest
--    of the counted cash goes to the safe. The next opening suggests float_kept as its starting
--    cash, so a normal night needs no safe move at all.
--
-- The cash drawer itself (shift_summaries, expected cash, net sales) does not change.
-- Shifts closed before go live keep their records as they are.
--
-- The kinds were narrowed to safe and ewallet afterwards by treasury-account-kinds-migration.sql.
-- This file now shows the final kinds, so a fresh database gets the same result either way.
--
-- Run in the Supabase SQL editor before deploying the matching cashier and admin app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS treasury_accounts (
  account_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('safe', 'ewallet')),
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  opened_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_one_safe ON treasury_accounts (kind) WHERE kind = 'safe';

INSERT INTO treasury_accounts (name, kind)
SELECT 'Safe', 'safe'
WHERE NOT EXISTS (SELECT 1 FROM treasury_accounts WHERE kind = 'safe');

CREATE TABLE IF NOT EXISTS treasury_entries (
  entry_id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES treasury_accounts(account_id),
  kind TEXT NOT NULL CHECK (kind IN ('opening_balance', 'deposit', 'withdrawal', 'float_out', 'float_return', 'shift_deposit', 'cash_drop', 'cash_top_up', 'correction')),
  amount NUMERIC(12, 2) NOT NULL,
  balance_after NUMERIC(12, 2) NOT NULL CHECK (balance_after >= 0),
  shift_id INTEGER REFERENCES shifts(shift_id),
  movement_id INTEGER UNIQUE REFERENCES cash_movements(movement_id),
  corrects_entry_id INTEGER REFERENCES treasury_entries(entry_id),
  reason TEXT NOT NULL,
  note TEXT,
  admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  source_app TEXT NOT NULL DEFAULT 'admin' CHECK (source_app IN ('cashier', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Each kind moves money in its own direction. Only an opening balance may be 0.
  CONSTRAINT treasury_entries_direction CHECK (
    (kind = 'opening_balance' AND amount >= 0)
    OR (kind IN ('deposit', 'float_return', 'shift_deposit', 'cash_drop') AND amount > 0)
    OR (kind IN ('withdrawal', 'float_out', 'cash_top_up') AND amount < 0)
    OR (kind = 'correction' AND amount <> 0)
  ),
  -- Moves made by a shift say which shift.
  CONSTRAINT treasury_entries_shift CHECK (kind NOT IN ('float_out', 'float_return', 'shift_deposit', 'cash_drop', 'cash_top_up') OR shift_id IS NOT NULL),
  -- A drawer movement says which one.
  CONSTRAINT treasury_entries_movement CHECK (kind NOT IN ('cash_drop', 'cash_top_up') OR movement_id IS NOT NULL)
);

-- One opening balance per account.
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_opening ON treasury_entries (account_id) WHERE kind = 'opening_balance';
CREATE INDEX IF NOT EXISTS idx_treasury_entries_account ON treasury_entries (account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_treasury_entries_shift ON treasury_entries (shift_id);

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS carried_float NUMERIC(12, 2) CHECK (carried_float >= 0);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS float_kept NUMERIC(12, 2) CHECK (float_kept >= 0);

-- Keeps the tables out of the Supabase Data API. The apps connect as the owner and are not affected.
ALTER TABLE treasury_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON treasury_accounts FROM anon, authenticated;
ALTER TABLE treasury_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON treasury_entries FROM anon, authenticated;
