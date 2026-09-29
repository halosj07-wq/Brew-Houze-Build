-- Kitchen stations migration: the bar and the kitchen get their own queues
--
-- 1. products.station: where a product is made, bar or kitchen. Every product starts at the
--    bar, except Pastries, which start in the kitchen (only on the first run, while no product
--    is a kitchen item yet, so later changes made in Admin are kept).
-- 2. sales_order_items.station: the station of each ordered item, copied when the order is
--    placed, so changing a product later does not move orders already in the queue. Old items
--    are filled in from their product.
-- 3. order_stations: one row per order and station it needs (an order with drinks and food has
--    a bar row and a kitchen row). Each station marks its part ready, then the counter hands it
--    over. sales_orders.queue_status still sums it up for everything else:
--      waiting    while any part is being made
--      served     when every part is ready (the queue screen, the phone and the rider see it)
--      flushed    when everything was picked up
--    Orders in the queue right now get their rows here.
-- 4. store_settings.pickup_mode: together (the number is called once, when every part is ready)
--    or separate (drinks and food are called and picked up on their own). Starts as together.
-- 5. The kitchen role needs no change: admin_users.role is free text. Admin gives it in
--    Accounts and Employees.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE products ADD COLUMN IF NOT EXISTS station TEXT NOT NULL DEFAULT 'bar';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_station_check;
ALTER TABLE products ADD CONSTRAINT products_station_check CHECK (station IN ('bar', 'kitchen'));
UPDATE products SET station = 'kitchen'
  WHERE LOWER(TRIM(product_category)) IN ('pastries', 'pastry')
    AND NOT EXISTS (SELECT 1 FROM products other WHERE other.station = 'kitchen');

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS station TEXT;
ALTER TABLE sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_station_check;
ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_station_check CHECK (station IS NULL OR station IN ('bar', 'kitchen'));
UPDATE sales_order_items soi SET station = p.station
  FROM products p
  WHERE p.product_id = soi.product_id AND soi.station IS NULL;

CREATE TABLE IF NOT EXISTS order_stations (
  order_id INTEGER NOT NULL REFERENCES sales_orders(order_id) ON DELETE CASCADE,
  station TEXT NOT NULL CHECK (station IN ('bar', 'kitchen')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'picked_up')),
  ready_at TIMESTAMPTZ,
  ready_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  picked_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id, station)
);
CREATE INDEX IF NOT EXISTS idx_order_stations_open ON order_stations (station, status);

INSERT INTO order_stations (order_id, station, status, ready_at)
  SELECT parts.order_id, parts.station,
    CASE WHEN parts.queue_status = 'served' THEN 'ready' ELSE 'waiting' END,
    CASE WHEN parts.queue_status = 'served' THEN parts.served_at END
  FROM (
    SELECT DISTINCT so.order_id, COALESCE(soi.station, 'bar') AS station, so.queue_status, so.served_at
    FROM sales_orders so JOIN sales_order_items soi ON soi.order_id = so.order_id
    WHERE so.queue_status IN ('waiting', 'served')
  ) parts
  ON CONFLICT (order_id, station) DO NOTHING;

INSERT INTO store_settings (setting_key, setting_value) VALUES ('pickup_mode', 'together') ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE order_stations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_stations FROM anon, authenticated;
