-- Void and refund return method migration
--
-- A voided or refunded order records how the money went back to the customer: handed back in
-- cash from the drawer, or sent by the cafe through GCash by hand. For GCash returns the
-- customer name, number and the transfer reference are kept with the order.
--
-- The cash drawer now follows the return method instead of the original payment:
--   cash order returned in cash     -> taken out of the drawer (as before)
--   cash order returned by GCash    -> the drawer keeps it
--   GCash order returned in cash    -> taken out of the drawer
-- Orders reversed before this migration have no return method and keep the old rule
-- (cash payments came out of the drawer).
--
-- Run in the Supabase SQL editor before deploying the matching cashier and admin app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS return_method TEXT,
  ADD COLUMN IF NOT EXISTS return_gcash_name TEXT,
  ADD COLUMN IF NOT EXISTS return_gcash_number TEXT,
  ADD COLUMN IF NOT EXISTS return_reference TEXT;

ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_return_method_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_return_method_check
  CHECK (return_method IS NULL OR return_method IN ('cash', 'gcash'));

-- Same view as before with two changes: cash_reversed follows the return method, and a new
-- last column gcash_returned totals what was sent back through GCash.
CREATE OR REPLACE VIEW shift_summaries AS
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
    COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric)) AS expected_cash,
    s.counted_cash - COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric)) AS cash_difference,
    COALESCE(costs.sold_cost, 0::numeric) - COALESCE(costs.reversed_cost, 0::numeric) AS cost_of_goods,
    COALESCE(costs.uncosted_items, 0::bigint)::integer AS uncosted_items,
    COALESCE(reversed.gcash_returned, 0::numeric) AS gcash_returned
   FROM shifts s
     LEFT JOIN admin_users opener ON opener.admin_id = s.opened_by
     LEFT JOIN admin_users closer ON closer.admin_id = s.closed_by
     LEFT JOIN LATERAL ( SELECT count(*) AS order_count,
            count(*) FILTER (WHERE so.order_source = 'online'::text) AS mobile_order_count,
            sum(so.total_amount) AS gross_sales,
            sum(so.total_amount) FILTER (WHERE so.payment_method::text = 'cash'::text) AS cash_sales,
            sum(so.total_amount) FILTER (WHERE so.payment_method::text <> 'cash'::text) AS online_sales
           FROM sales_orders so
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) sold ON true
     LEFT JOIN LATERAL ( SELECT sum(soi.quantity) AS items_sold
           FROM sales_order_items soi
             JOIN sales_orders so ON so.order_id = soi.order_id
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) items ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE so.status::text = ANY (ARRAY['void'::text, 'voided'::text])) AS void_count,
            count(*) FILTER (WHERE so.status::text = ANY (ARRAY['refund'::text, 'refunded'::text])) AS refund_count,
            sum(so.total_amount) AS reversed_amount,
            sum(so.total_amount) FILTER (WHERE COALESCE(so.return_method, CASE WHEN so.payment_method::text = 'cash'::text THEN 'cash' ELSE 'online' END) = 'cash') AS cash_reversed,
            sum(so.total_amount) FILTER (WHERE so.return_method = 'gcash') AS gcash_returned
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
          WHERE (so.shift_id = s.shift_id OR so.reversed_shift_id = s.shift_id) AND so.is_archived = false) costs ON true;
