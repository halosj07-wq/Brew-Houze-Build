-- Expenses migration (treasury phase 3)
--
-- What the cafe spends to run, apart from the ingredients it sells. Restocking inventory is NOT
-- an expense: its cost is already counted in the cost of goods as the stock is sold, so
-- recording it here too would count it twice. Expenses are everything else, for example
-- supplies, wages, rent, utilities and repairs.
--
-- 1. expenses: one row per expense, with the business date it belongs to, a category, what it
--    was for, the amount, and where the money came from:
--      safe    taken from the safe (a treasury entry of kind expense, linked by entry_id)
--      drawer  taken from the cash drawer during a shift (a cash out, linked by movement_id).
--              Every cash out recorded in the apps is an expense from now on.
--      owner   paid by the owner from their own money. Nothing in the treasury moves: it is
--              money the owner put into the business.
--    Expenses are never edited or deleted. A mistake is voided (voided_at, voided_by,
--    void_reason). Voiding a safe expense puts the money back in the safe with a correction.
--
-- 2. treasury_entries gets one more kind: expense (minus, the safe only).
--
-- 3. Cash outs already recorded become expenses, dated by their shift (category Other unless
--    the reason matches one), so Finance shows them from the start.
--
-- Finance then shows net profit: gross profit, minus PayMongo fees, minus expenses.
--
-- Run in the Supabase SQL editor before deploying the matching app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS expenses (
  expense_id SERIAL PRIMARY KEY,
  spent_on DATE NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_from TEXT NOT NULL CHECK (paid_from IN ('safe', 'drawer', 'owner')),
  shift_id INTEGER REFERENCES shifts(shift_id),
  movement_id INTEGER UNIQUE REFERENCES cash_movements(movement_id),
  entry_id INTEGER UNIQUE REFERENCES treasury_entries(entry_id),
  reference TEXT,
  note TEXT,
  admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  source_app TEXT NOT NULL DEFAULT 'admin' CHECK (source_app IN ('cashier', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at TIMESTAMPTZ,
  voided_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  void_reason TEXT,
  -- A drawer expense names its cash out and shift, a safe expense its treasury entry.
  CONSTRAINT expenses_paid_from_link CHECK (
    (paid_from <> 'drawer' OR (movement_id IS NOT NULL AND shift_id IS NOT NULL))
    AND (paid_from <> 'safe' OR entry_id IS NOT NULL)
  ),
  CONSTRAINT expenses_void_reason CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON expenses (spent_on);
CREATE INDEX IF NOT EXISTS idx_expenses_shift ON expenses (shift_id);

ALTER TABLE treasury_entries DROP CONSTRAINT IF EXISTS treasury_entries_kind_check;
ALTER TABLE treasury_entries ADD CONSTRAINT treasury_entries_kind_check CHECK (kind IN ('opening_balance', 'deposit', 'withdrawal', 'float_out', 'float_return', 'shift_deposit', 'cash_drop', 'cash_top_up', 'correction', 'gcash_sales', 'gateway_fee', 'payout', 'expense'));

ALTER TABLE treasury_entries DROP CONSTRAINT IF EXISTS treasury_entries_direction;
ALTER TABLE treasury_entries ADD CONSTRAINT treasury_entries_direction CHECK (
  (kind = 'opening_balance' AND amount >= 0)
  OR (kind IN ('deposit', 'float_return', 'shift_deposit', 'cash_drop', 'gcash_sales') AND amount > 0)
  OR (kind IN ('withdrawal', 'float_out', 'cash_top_up', 'gateway_fee', 'payout', 'expense') AND amount < 0)
  OR (kind = 'correction' AND amount <> 0)
);

-- Cash outs already recorded, as drawer expenses.
INSERT INTO expenses (spent_on, category, description, amount, paid_from, shift_id, movement_id, note, admin_id, source_app, created_at)
SELECT (sh.opened_at AT TIME ZONE 'Asia/Manila')::date,
  CASE WHEN cm.reason IN ('Supplies', 'Ice') THEN 'Supplies' WHEN cm.reason = 'Delivery' THEN 'Delivery' WHEN cm.reason = 'Staff meal' THEN 'Staff meals' ELSE 'Other' END,
  cm.reason, cm.amount, 'drawer', cm.shift_id, cm.movement_id, cm.note, cm.admin_id, cm.source_app, cm.created_at
FROM cash_movements cm
JOIN shifts sh ON sh.shift_id = cm.shift_id
WHERE cm.kind = 'cash_out'
  AND NOT EXISTS (SELECT 1 FROM expenses ex WHERE ex.movement_id = cm.movement_id);

-- Keeps the table out of the Supabase Data API. The apps connect as the owner and are not affected.
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenses FROM anon, authenticated;
