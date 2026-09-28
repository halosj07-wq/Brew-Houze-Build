-- Delivery orders migration (phase 3 of delivery)
--
-- 1. Delivery becomes an order type next to dine in and take out (orders, GCash payments in
--    progress, and ID photo checks).
-- 2. sales_orders.delivery_fee: the fee on a delivery order. The total is the items, minus
--    discounts and VAT exempted, plus this fee. Cash on delivery orders use payment_method cod.
-- 3. payment_checkouts.delivery: the delivery details of a GCash payment until it is paid.
-- 4. deliveries: one row per delivery order. The address as it was when ordered, the status,
--    the rider, and for cash on delivery the amount, what the rider collected, and when the
--    cashier received it (and in which shift, for the cash drawer).
--      preparing -> ready -> out -> delivered
--      any step before delivered -> failed (the rider could not deliver) or cancelled (voided)
-- 5. shift_summaries: cash on delivery orders no longer count as online sales, cash the riders
--    hand in counts in the drawer of the shift it was received in, and four new columns at the
--    end: cod_sales, cod_remitted, delivery_fees, delivery_count.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_service_type_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_service_type_check CHECK (service_type IS NULL OR service_type IN ('dine_in', 'take_out', 'delivery'));
ALTER TABLE payment_checkouts DROP CONSTRAINT IF EXISTS payment_checkouts_service_type_check;
ALTER TABLE payment_checkouts ADD CONSTRAINT payment_checkouts_service_type_check CHECK (service_type IS NULL OR service_type IN ('dine_in', 'take_out', 'delivery'));
ALTER TABLE id_verifications DROP CONSTRAINT IF EXISTS id_verifications_service_type_check;
ALTER TABLE id_verifications ADD CONSTRAINT id_verifications_service_type_check CHECK (service_type IS NULL OR service_type IN ('dine_in', 'take_out', 'delivery'));

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0);
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS delivery JSONB;

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES sales_orders(order_id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
  address_id INTEGER REFERENCES customer_addresses(address_id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  street TEXT NOT NULL,
  landmark TEXT,
  rider_notes TEXT,
  zone_id INTEGER REFERENCES delivery_zones(zone_id) ON DELETE SET NULL,
  zone_name TEXT NOT NULL,
  fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  payment TEXT NOT NULL CHECK (payment IN ('gcash', 'cod')),
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'ready', 'out', 'delivered', 'failed', 'cancelled')),
  -- A senior, PWD or other ID discount: the rider checks the ID at the door.
  check_id BOOLEAN NOT NULL DEFAULT FALSE,
  rider_admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  cod_amount NUMERIC(10, 2),
  cod_collected NUMERIC(10, 2),
  cod_remitted_at TIMESTAMPTZ,
  cod_remitted_to INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  cod_remitted_shift_id INTEGER REFERENCES shifts(shift_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries (status, created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_rider ON deliveries (rider_admin_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_remitted_shift ON deliveries (cod_remitted_shift_id);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON deliveries FROM anon, authenticated;

-- The same view as before with these changes: COD is not an online sale, expected cash adds the
-- COD cash received in the shift, and four columns are added at the end.
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
    COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) + COALESCE(cod.cod_remitted, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric) + COALESCE(moves.cash_added, 0::numeric) - COALESCE(moves.cash_removed, 0::numeric)) AS expected_cash,
    s.counted_cash - COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) + COALESCE(cod.cod_remitted, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric) + COALESCE(moves.cash_added, 0::numeric) - COALESCE(moves.cash_removed, 0::numeric)) AS cash_difference,
    COALESCE(costs.sold_cost, 0::numeric) - COALESCE(costs.reversed_cost, 0::numeric) AS cost_of_goods,
    COALESCE(costs.uncosted_items, 0::bigint)::integer AS uncosted_items,
    COALESCE(reversed.gcash_returned, 0::numeric) AS gcash_returned,
    COALESCE(moves.cash_added, 0::numeric) AS cash_added,
    COALESCE(moves.cash_removed, 0::numeric) AS cash_removed,
    COALESCE(sold.cod_sales, 0::numeric) AS cod_sales,
    COALESCE(cod.cod_remitted, 0::numeric) AS cod_remitted,
    COALESCE(sold.delivery_fees, 0::numeric) AS delivery_fees,
    COALESCE(sold.delivery_count, 0::bigint)::integer AS delivery_count
   FROM shifts s
     LEFT JOIN admin_users opener ON opener.admin_id = s.opened_by
     LEFT JOIN admin_users closer ON closer.admin_id = s.closed_by
     LEFT JOIN LATERAL ( SELECT count(*) AS order_count,
            count(*) FILTER (WHERE so.order_source = 'online'::text) AS mobile_order_count,
            sum(so.total_amount) AS gross_sales,
            sum(
                CASE so.payment_method::text
                    WHEN 'cash'::text THEN so.total_amount
                    WHEN 'split'::text THEN COALESCE(so.cash_portion, 0::numeric)
                    ELSE 0::numeric
                END) AS cash_sales,
            sum(
                CASE so.payment_method::text
                    WHEN 'cash'::text THEN 0::numeric
                    WHEN 'cod'::text THEN 0::numeric
                    WHEN 'split'::text THEN so.total_amount - COALESCE(so.cash_portion, 0::numeric)
                    ELSE so.total_amount
                END) AS online_sales,
            sum(so.total_amount) FILTER (WHERE so.payment_method::text = 'cod'::text) AS cod_sales,
            sum(so.delivery_fee) AS delivery_fees,
            count(*) FILTER (WHERE so.service_type = 'delivery'::text) AS delivery_count
           FROM sales_orders so
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) sold ON true
     LEFT JOIN LATERAL ( SELECT sum(soi.quantity) AS items_sold
           FROM sales_order_items soi
             JOIN sales_orders so ON so.order_id = soi.order_id
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) items ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE so.status::text = ANY (ARRAY['void'::text, 'voided'::text])) AS void_count,
            count(*) FILTER (WHERE so.status::text = ANY (ARRAY['refund'::text, 'refunded'::text])) AS refund_count,
            sum(so.total_amount) AS reversed_amount,
            sum(
                CASE COALESCE(so.return_method,
                    CASE
                        WHEN so.payment_method::text = 'cash'::text THEN 'cash'::text
                        ELSE 'online'::text
                    END)
                    WHEN 'cash'::text THEN so.total_amount
                    WHEN 'split'::text THEN COALESCE(so.cash_portion, 0::numeric)
                    ELSE 0::numeric
                END) AS cash_reversed,
            sum(
                CASE so.return_method
                    WHEN 'gcash'::text THEN so.total_amount
                    WHEN 'split'::text THEN so.total_amount - COALESCE(so.cash_portion, 0::numeric)
                    ELSE 0::numeric
                END) AS gcash_returned
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
     LEFT JOIN LATERAL ( SELECT sum(cm.amount) FILTER (WHERE cm.kind = 'cash_in'::text) AS cash_added,
            sum(cm.amount) FILTER (WHERE cm.kind = ANY (ARRAY['cash_out'::text, 'cash_drop'::text])) AS cash_removed
           FROM cash_movements cm
          WHERE cm.shift_id = s.shift_id) moves ON true
     LEFT JOIN LATERAL ( SELECT sum(d.cod_collected) AS cod_remitted
           FROM deliveries d
          WHERE d.cod_remitted_shift_id = s.shift_id) cod ON true;
