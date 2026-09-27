-- Cash drawer movements migration
--
-- Records cash put into or taken out of the drawer during a shift for reasons other than a sale:
--   cash_in    money added, for example coins for change
--   cash_out   money paid out, for example ice or a delivery
--   cash_drop  large bills moved to the safe
-- Each entry keeps the shift, amount, reason, who made it and when. Entries are never edited or
-- deleted: a mistake is corrected with an opposite entry, so the history stays complete.
--
-- Expected cash in the drawer now also counts these:
--   starting cash + cash sales - cash given back + cash added - cash taken out
-- Shifts closed before this migration keep the expected cash stored when they were closed.
--
-- Run in the Supabase SQL editor before deploying the matching cashier and admin app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS cash_movements (
  movement_id SERIAL PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES shifts(shift_id),
  kind TEXT NOT NULL CHECK (kind IN ('cash_in', 'cash_out', 'cash_drop')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  note TEXT,
  admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  source_app TEXT NOT NULL DEFAULT 'cashier' CHECK (source_app IN ('cashier', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements (shift_id, created_at);

-- Keeps the table out of the Supabase Data API. The apps connect as the owner and are not affected.
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cash_movements FROM anon, authenticated;

-- Same view as before with two changes: expected cash counts cash added and taken out, and two
-- new last columns (cash_added, cash_removed) total them per shift.
CREATE OR REPLACE VIEW shift_summaries WITH (security_invoker = true) AS
 SELECT s.shift_id,
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
    (s.opened_at AT TIME ZONE 'Asia/Manila'::text)::date AS business_date,
    COALESCE(sold.order_count, 0::bigint)::integer AS order_count,
    COALESCE(sold.mobile_order_count, 0::bigint)::integer AS mobile_order_count,
    COALESCE(items.items_sold, 0::bigint)::integer AS items_sold,
    COALESCE(sold.gross_sales, 0::numeric) AS gross_sales,
    COALESCE(sold.cash_sales, 0::numeric) AS cash_sales,
    COALESCE(sold.online_sales, 0::numeric) AS online_sales,
    COALESCE(reversed.void_count, 0::bigint)::integer AS void_count,
    COALESCE(reversed.refund_count, 0::bigint)::integer AS refund_count,
    COALESCE(reversed.reversed_amount, 0::numeric) AS reversed_amount,
    COALESCE(reversed.cash_reversed, 0::numeric) AS cash_reversed,
    COALESCE(sold.gross_sales, 0::numeric) - COALESCE(reversed.reversed_amount, 0::numeric) AS net_sales,
    COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric) + COALESCE(moves.cash_added, 0::numeric) - COALESCE(moves.cash_removed, 0::numeric)) AS expected_cash,
    s.counted_cash - COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric) + COALESCE(moves.cash_added, 0::numeric) - COALESCE(moves.cash_removed, 0::numeric)) AS cash_difference,
    COALESCE(costs.sold_cost, 0::numeric) - COALESCE(costs.reversed_cost, 0::numeric) AS cost_of_goods,
    COALESCE(costs.uncosted_items, 0::bigint)::integer AS uncosted_items,
    COALESCE(reversed.gcash_returned, 0::numeric) AS gcash_returned,
    COALESCE(moves.cash_added, 0::numeric) AS cash_added,
    COALESCE(moves.cash_removed, 0::numeric) AS cash_removed
   FROM shifts s
     LEFT JOIN admin_users opener ON opener.admin_id = s.opened_by
     LEFT JOIN admin_users closer ON closer.admin_id = s.closed_by
     LEFT JOIN LATERAL ( SELECT count(*) AS order_count,
            count(*) FILTER (WHERE so.order_source = 'online'::text) AS mobile_order_count,
            sum(so.total_amount) AS gross_sales,
            sum(CASE so.payment_method::text WHEN 'cash' THEN so.total_amount WHEN 'split' THEN COALESCE(so.cash_portion, 0::numeric) ELSE 0::numeric END) AS cash_sales,
            sum(CASE so.payment_method::text WHEN 'cash' THEN 0::numeric WHEN 'split' THEN so.total_amount - COALESCE(so.cash_portion, 0::numeric) ELSE so.total_amount END) AS online_sales
           FROM sales_orders so
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) sold ON true
     LEFT JOIN LATERAL ( SELECT sum(soi.quantity) AS items_sold
           FROM sales_order_items soi
             JOIN sales_orders so ON so.order_id = soi.order_id
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) items ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE so.status::text = ANY (ARRAY['void'::text, 'voided'::text])) AS void_count,
            count(*) FILTER (WHERE so.status::text = ANY (ARRAY['refund'::text, 'refunded'::text])) AS refund_count,
            sum(so.total_amount) AS reversed_amount,
            sum(CASE COALESCE(so.return_method, CASE WHEN so.payment_method::text = 'cash'::text THEN 'cash' ELSE 'online' END)
                  WHEN 'cash' THEN so.total_amount
                  WHEN 'split' THEN COALESCE(so.cash_portion, 0::numeric)
                  ELSE 0::numeric END) AS cash_reversed,
            sum(CASE so.return_method
                  WHEN 'gcash' THEN so.total_amount
                  WHEN 'split' THEN so.total_amount - COALESCE(so.cash_portion, 0::numeric)
                  ELSE 0::numeric END) AS gcash_returned
           FROM sales_orders so
          WHERE so.reversed_shift_id = s.shift_id AND so.is_archived = false) reversed ON true
     LEFT JOIN LATERAL ( SELECT sum(line.line_cost) FILTER (WHERE so.shift_id = s.shift_id) AS sold_cost,
            sum(line.line_cost) FILTER (WHERE so.reversed_shift_id = s.shift_id) AS reversed_cost,
            sum(line.quantity) FILTER (WHERE so.shift_id = s.shift_id AND line.line_cost IS NULL) AS uncosted_items
           FROM sales_orders so
             JOIN LATERAL ( SELECT soi.quantity,
                        CASE
                            WHEN soi.unit_cost IS NOT NULL AND COALESCE(line_additions.all_costed, true) THEN soi.quantity::numeric * soi.unit_cost + COALESCE(line_additions.cost, 0::numeric)
                            ELSE NULL::numeric
                        END AS line_cost
                   FROM sales_order_items soi
                     LEFT JOIN LATERAL ( SELECT sum(soia.quantity * soia.unit_cost) AS cost,
                            bool_and(soia.unit_cost IS NOT NULL) AS all_costed
                           FROM sales_order_item_additions soia
                          WHERE soia.order_item_id = soi.order_item_id) line_additions ON true
                  WHERE soi.order_id = so.order_id) line ON true
          WHERE (so.shift_id = s.shift_id OR so.reversed_shift_id = s.shift_id) AND so.is_archived = false) costs ON true
     LEFT JOIN LATERAL ( SELECT sum(cm.amount) FILTER (WHERE cm.kind = 'cash_in') AS cash_added,
            sum(cm.amount) FILTER (WHERE cm.kind = ANY (ARRAY['cash_out'::text, 'cash_drop'::text])) AS cash_removed
           FROM cash_movements cm
          WHERE cm.shift_id = s.shift_id) moves ON true;

-- Keeps the view out of the Supabase Data API (see view-security-migration.sql).
REVOKE ALL ON shift_summaries FROM anon, authenticated;
