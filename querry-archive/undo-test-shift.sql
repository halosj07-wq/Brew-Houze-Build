-- Undo a test shift: removes shift 31 (opened today to test the receipt printer) and everything it
-- created, and puts the stock its orders used back. Nothing from earlier shifts is touched.
--
--   removed   the shift, its orders (with their items, add-ons, bar/kitchen tickets and discounts),
--             the stock history entries of those orders, any Stars they earned, and the shift's
--             staff time logs
--   restored  inventory quantities, by exactly what those orders took (less anything a void or
--             refund already put back)
--
-- It stops and changes nothing if the shift is not today's latest shift, or if it has money moved
-- that must be undone by hand: cash in/out, expenses, safe/treasury entries, delivery cash handed
-- in, waste reports, or Stars rewards claimed.
--
-- STEP 1: run only the PREVIEW part below (select it and press Run) and check it shows your test.
-- STEP 2: run the whole file.

-- ── PREVIEW (read only) ──────────────────────────────────────────────────────────────────────
SELECT 'shift' AS what, s.shift_id::text AS id,
  TO_CHAR(s.opened_at AT TIME ZONE 'Asia/Manila', 'Mon DD HH12:MI AM') || CASE WHEN s.closed_at IS NULL THEN ' (still open)' ELSE ' to ' || TO_CHAR(s.closed_at AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') END AS detail
FROM shifts s WHERE s.shift_id = 31
UNION ALL
SELECT 'order', so.order_id::text, 'queue #' || so.queue_number || ', ₱' || so.total_amount || ', ' || so.status
FROM sales_orders so WHERE so.shift_id = 31
UNION ALL
SELECT 'stock entry', il.log_id::text, il.item_name || ' ' || il.quantity_delta || ' ' || il.unit_of_measure || ' (' || il.change_type || ')'
FROM inventory_log il WHERE il.order_id IN (SELECT order_id FROM sales_orders WHERE shift_id = 31)
UNION ALL
SELECT 'time log', t.time_log_id::text, COALESCE(a.full_name, 'staff #' || t.admin_id)
FROM employee_time_logs t LEFT JOIN admin_users a ON a.admin_id = t.admin_id WHERE t.shift_id = 31;
-- ── END OF PREVIEW ───────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  target CONSTANT INT := 31;
  latest INT;
  opened_today BOOLEAN;
  blockers TEXT;
BEGIN
  SELECT (opened_at AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date INTO opened_today FROM shifts WHERE shift_id = target;
  IF opened_today IS NULL THEN RAISE EXCEPTION 'Shift % is not in the database (already removed?). Nothing was changed.', target; END IF;
  IF NOT opened_today THEN RAISE EXCEPTION 'Shift % was not opened today. Nothing was changed.', target; END IF;
  SELECT MAX(shift_id) INTO latest FROM shifts;
  IF latest <> target THEN RAISE EXCEPTION 'Shift % is not the latest shift (% is). Nothing was changed.', target, latest; END IF;

  SELECT string_agg(label, ', ') INTO blockers FROM (
    SELECT 'cash in/out' AS label WHERE EXISTS (SELECT 1 FROM cash_movements WHERE shift_id = target)
    UNION ALL SELECT 'expenses' WHERE EXISTS (SELECT 1 FROM expenses WHERE shift_id = target)
    UNION ALL SELECT 'safe/treasury entries' WHERE EXISTS (SELECT 1 FROM treasury_entries WHERE shift_id = target)
    UNION ALL SELECT 'delivery cash handed in' WHERE EXISTS (SELECT 1 FROM deliveries WHERE cod_remitted_shift_id = target)
    UNION ALL SELECT 'waste reports' WHERE EXISTS (SELECT 1 FROM write_off_requests WHERE shift_id = target)
    UNION ALL SELECT 'stock entries not from an order' WHERE EXISTS (SELECT 1 FROM inventory_log WHERE shift_id = target AND order_id IS NULL)
    UNION ALL SELECT 'orders from earlier shifts voided or refunded in it' WHERE EXISTS (SELECT 1 FROM sales_orders WHERE reversed_shift_id = target AND shift_id <> target)
    UNION ALL SELECT 'Stars rewards claimed' WHERE EXISTS (SELECT 1 FROM loyalty_claims WHERE order_id IN (SELECT order_id FROM sales_orders WHERE shift_id = target))
    UNION ALL SELECT 'birthday rewards claimed' WHERE EXISTS (SELECT 1 FROM loyalty_birthday_claims WHERE order_id IN (SELECT order_id FROM sales_orders WHERE shift_id = target))
  ) found;
  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'Shift % has % that must be undone by hand. Nothing was changed.', target, blockers;
  END IF;
END $$;

-- Put back the stock the orders took (net of anything a void or refund already returned)
UPDATE inventory i
SET quantity = i.quantity - used.delta, updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT inventory_id, SUM(quantity_delta) AS delta
  FROM inventory_log
  WHERE inventory_id IS NOT NULL AND order_id IN (SELECT order_id FROM sales_orders WHERE shift_id = 31)
  GROUP BY inventory_id
) used
WHERE i.inventory_id = used.inventory_id AND used.delta <> 0;

-- Remove what the shift created
DELETE FROM inventory_log WHERE order_id IN (SELECT order_id FROM sales_orders WHERE shift_id = 31);
DELETE FROM loyalty_star_entries WHERE order_id IN (SELECT order_id FROM sales_orders WHERE shift_id = 31);
DELETE FROM sales_orders WHERE shift_id = 31; -- items, add-ons, bar/kitchen tickets, discounts and deliveries go with it
DELETE FROM employee_time_logs WHERE shift_id = 31;
DELETE FROM shifts WHERE shift_id = 31;

COMMIT;

-- Result: should show 0 left and shift 30 (or earlier) as the latest
SELECT
  (SELECT COUNT(*) FROM shifts WHERE shift_id = 31) AS shift_31_left,
  (SELECT COUNT(*) FROM sales_orders WHERE shift_id = 31) AS orders_left,
  (SELECT MAX(shift_id) FROM shifts) AS latest_shift;
