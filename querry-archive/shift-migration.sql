-- Shift migration
--
-- The business day of the cafe can run past midnight (e.g. 8 PM to 2 AM), so sales can no
-- longer be grouped by calendar date. A "shift" is opened and closed manually from the cashier
-- app and everything that happens in between belongs to it:
--   * sales_orders.shift_id            the shift the sale was punched in
--   * sales_orders.reversed_shift_id   the shift a void/refund happened in (refunding an order
--                                      from last night is recorded under the current shift, so
--                                      the report of a closed shift never changes afterwards)
--   * employee_time_logs.shift_id      the shift an employee login belongs to
--   * inventory_log.shift_id           the shift a stock change happened in
-- Queue numbers restart per shift instead of at midnight.
--
-- Only one shift can be open at a time (enforced by a unique partial index).
-- inventory_log and employee_time_logs get their shift_id from a column default, so every app
-- that writes them (admin, cashier, mobile) is covered without changing each INSERT.
--
-- Written so it also runs in SQL consoles that split scripts on every semicolon: no
-- semicolons or quote marks inside function bodies, strings or comments.
--
-- Existing records are grouped into one "historical" shift per calendar day (Asia/Manila), so
-- old reports keep working. Purely additive, safe to run more than once.
-- Run once before deploying the matching app code.

-- 1) Shifts
CREATE TABLE IF NOT EXISTS shifts (
  shift_id SERIAL PRIMARY KEY,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opened_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  starting_cash NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (starting_cash >= 0),
  closed_at TIMESTAMPTZ,
  closed_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  expected_cash NUMERIC(12, 2),
  counted_cash NUMERIC(12, 2) CHECK (counted_cash IS NULL OR counted_cash >= 0),
  closing_notes TEXT,
  is_historical BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT shifts_close_after_open CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_idx ON shifts ((closed_at IS NULL)) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS shifts_opened_at_idx ON shifts (opened_at DESC);

-- 2) Shift links
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(shift_id),
  ADD COLUMN IF NOT EXISTS reversed_shift_id INTEGER REFERENCES shifts(shift_id);
ALTER TABLE employee_time_logs
  ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(shift_id);
ALTER TABLE inventory_log
  ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_shift_id ON sales_orders (shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_reversed_shift_id ON sales_orders (reversed_shift_id);
CREATE INDEX IF NOT EXISTS idx_employee_time_logs_shift_id ON employee_time_logs (shift_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_shift_id ON inventory_log (shift_id);

-- 3) Attach new inventory changes and time logs to whichever shift is open (if any).
--    A column default calls a one-line SQL function. Its body is a single quoted statement with
--    no semicolon, so SQL consoles that split scripts on every semicolon run it correctly.
CREATE OR REPLACE FUNCTION current_open_shift_id() RETURNS INTEGER
  LANGUAGE sql STABLE
  AS 'SELECT shift_id FROM shifts WHERE closed_at IS NULL LIMIT 1';

ALTER TABLE inventory_log ALTER COLUMN shift_id SET DEFAULT current_open_shift_id();
ALTER TABLE employee_time_logs ALTER COLUMN shift_id SET DEFAULT current_open_shift_id();

-- Clean up the trigger-based version from an earlier draft of this file, if it was created.
DROP TRIGGER IF EXISTS inventory_log_set_shift ON inventory_log;
DROP TRIGGER IF EXISTS employee_time_logs_set_shift ON employee_time_logs;
DROP FUNCTION IF EXISTS set_current_shift_id();

-- 4) Backfill: one historical shift per calendar day for records made before shifts existed.
--    Only records older than the first real shift are backfilled, so re-running this file
--    later never pulls new activity into a historical shift.
WITH cutoff AS (
  SELECT COALESCE(MIN(opened_at), 'infinity'::timestamptz) AS first_real_shift
  FROM shifts WHERE is_historical = FALSE
), activity AS (
  SELECT (so.created_at AT TIME ZONE 'UTC') AS happened_at FROM sales_orders so WHERE so.shift_id IS NULL
  UNION ALL SELECT so.reversed_at FROM sales_orders so WHERE so.reversed_at IS NOT NULL AND so.reversed_shift_id IS NULL
  UNION ALL SELECT t.time_in FROM employee_time_logs t WHERE t.shift_id IS NULL
  UNION ALL SELECT il.created_at FROM inventory_log il WHERE il.shift_id IS NULL
), activity_days AS (
  SELECT DISTINCT (activity.happened_at AT TIME ZONE 'Asia/Manila')::date AS business_date
  FROM activity, cutoff
  WHERE activity.happened_at < cutoff.first_real_shift
)
INSERT INTO shifts (opened_at, closed_at, starting_cash, is_historical, closing_notes)
SELECT
  (business_date::timestamp AT TIME ZONE 'Asia/Manila'),
  ((business_date + 1)::timestamp AT TIME ZONE 'Asia/Manila'),
  0,
  TRUE,
  'Grouped by calendar day from records made before shifts were introduced.'
FROM activity_days
WHERE NOT EXISTS (
  SELECT 1 FROM shifts existing
  WHERE existing.is_historical AND existing.opened_at = (activity_days.business_date::timestamp AT TIME ZONE 'Asia/Manila')
);

UPDATE sales_orders so SET shift_id = s.shift_id
FROM shifts s
WHERE so.shift_id IS NULL AND s.is_historical
  AND (so.created_at AT TIME ZONE 'UTC') >= s.opened_at AND (so.created_at AT TIME ZONE 'UTC') < s.closed_at;

UPDATE sales_orders so SET reversed_shift_id = s.shift_id
FROM shifts s
WHERE so.reversed_at IS NOT NULL AND so.reversed_shift_id IS NULL AND s.is_historical
  AND so.reversed_at >= s.opened_at AND so.reversed_at < s.closed_at;

UPDATE employee_time_logs t SET shift_id = s.shift_id
FROM shifts s
WHERE t.shift_id IS NULL AND s.is_historical
  AND t.time_in >= s.opened_at AND t.time_in < s.closed_at;

UPDATE inventory_log il SET shift_id = s.shift_id
FROM shifts s
WHERE il.shift_id IS NULL AND s.is_historical
  AND il.created_at >= s.opened_at AND il.created_at < s.closed_at;

-- 5) Per-shift totals, shared by the cashier (close-shift summary) and admin (Finance) apps.
--    Sales count in the shift they were punched in, voids/refunds count in the shift they
--    happened in. Expected cash = starting cash + cash sales - cash given back. Once a shift
--    is closed its expected cash is frozen in shifts.expected_cash.
DROP VIEW IF EXISTS shift_summaries;
CREATE VIEW shift_summaries AS
SELECT
  s.shift_id,
  s.opened_at,
  s.closed_at,
  s.opened_by,
  s.closed_by,
  opener.full_name AS opened_by_name,
  closer.full_name AS closed_by_name,
  s.is_historical,
  s.starting_cash,
  s.counted_cash,
  s.closing_notes,
  (s.opened_at AT TIME ZONE 'Asia/Manila')::date AS business_date,
  COALESCE(sold.order_count, 0)::int AS order_count,
  COALESCE(sold.mobile_order_count, 0)::int AS mobile_order_count,
  COALESCE(items.items_sold, 0)::int AS items_sold,
  COALESCE(sold.gross_sales, 0) AS gross_sales,
  COALESCE(sold.cash_sales, 0) AS cash_sales,
  COALESCE(sold.online_sales, 0) AS online_sales,
  COALESCE(reversed.void_count, 0)::int AS void_count,
  COALESCE(reversed.refund_count, 0)::int AS refund_count,
  COALESCE(reversed.reversed_amount, 0) AS reversed_amount,
  COALESCE(reversed.cash_reversed, 0) AS cash_reversed,
  COALESCE(sold.gross_sales, 0) - COALESCE(reversed.reversed_amount, 0) AS net_sales,
  COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0) - COALESCE(reversed.cash_reversed, 0)) AS expected_cash,
  s.counted_cash - COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0) - COALESCE(reversed.cash_reversed, 0)) AS cash_difference,
  COALESCE(costs.sold_cost, 0) - COALESCE(costs.reversed_cost, 0) AS cost_of_goods,
  COALESCE(costs.uncosted_items, 0)::int AS uncosted_items
FROM shifts s
LEFT JOIN admin_users opener ON opener.admin_id = s.opened_by
LEFT JOIN admin_users closer ON closer.admin_id = s.closed_by
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS order_count,
    COUNT(*) FILTER (WHERE so.order_source = 'online') AS mobile_order_count,
    SUM(so.total_amount) AS gross_sales,
    SUM(so.total_amount) FILTER (WHERE so.payment_method = 'cash') AS cash_sales,
    SUM(so.total_amount) FILTER (WHERE so.payment_method <> 'cash') AS online_sales
  FROM sales_orders so
  WHERE so.shift_id = s.shift_id AND so.is_archived = FALSE
) sold ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(soi.quantity) AS items_sold
  FROM sales_order_items soi
  JOIN sales_orders so ON so.order_id = soi.order_id
  WHERE so.shift_id = s.shift_id AND so.is_archived = FALSE
) items ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE so.status IN ('void', 'voided')) AS void_count,
    COUNT(*) FILTER (WHERE so.status IN ('refund', 'refunded')) AS refund_count,
    SUM(so.total_amount) AS reversed_amount,
    SUM(so.total_amount) FILTER (WHERE so.payment_method = 'cash') AS cash_reversed
  FROM sales_orders so
  WHERE so.reversed_shift_id = s.shift_id AND so.is_archived = FALSE
) reversed ON TRUE
LEFT JOIN LATERAL (
  SELECT
    SUM(line.line_cost) FILTER (WHERE so.shift_id = s.shift_id) AS sold_cost,
    SUM(line.line_cost) FILTER (WHERE so.reversed_shift_id = s.shift_id) AS reversed_cost,
    SUM(line.quantity) FILTER (WHERE so.shift_id = s.shift_id AND line.line_cost IS NULL) AS uncosted_items
  FROM sales_orders so
  JOIN LATERAL (
    SELECT
      soi.quantity,
      CASE
        WHEN soi.unit_cost IS NOT NULL AND COALESCE(line_additions.all_costed, TRUE)
          THEN soi.quantity * soi.unit_cost + COALESCE(line_additions.cost, 0)
      END AS line_cost
    FROM sales_order_items soi
    LEFT JOIN LATERAL (
      SELECT SUM(soia.quantity * soia.unit_cost) AS cost, bool_and(soia.unit_cost IS NOT NULL) AS all_costed
      FROM sales_order_item_additions soia
      WHERE soia.order_item_id = soi.order_item_id
    ) line_additions ON TRUE
    WHERE soi.order_id = so.order_id
  ) line ON TRUE
  WHERE (so.shift_id = s.shift_id OR so.reversed_shift_id = s.shift_id) AND so.is_archived = FALSE
) costs ON TRUE;
