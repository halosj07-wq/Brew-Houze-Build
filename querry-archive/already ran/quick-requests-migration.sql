-- Quick requests: the request buttons in the Customize window of the Staff Portal
--
-- quick_requests holds short notes the cashier can tap on a cart line, such as Less ice or Spicy.
-- Each one is for drinks (bar) or food (kitchen), so a drink only shows drink requests and a dish
-- only food requests. The admin adds, renames and removes them in Menu, Requests. They are notes
-- only: they never change stock or price, and a tapped request is saved as text on the order line,
-- so removing one never changes past orders.
--
-- Starts with the eight requests that were built in, split between drinks and food.
--
-- Run in the Supabase SQL editor. Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS quick_requests (
  request_id SERIAL PRIMARY KEY,
  request_text TEXT NOT NULL CHECK (LENGTH(TRIM(request_text)) BETWEEN 1 AND 40),
  station TEXT NOT NULL DEFAULT 'bar' CHECK (station IN ('bar', 'kitchen')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS quick_requests_text_station_key ON quick_requests (LOWER(request_text), station);

ALTER TABLE quick_requests ENABLE ROW LEVEL SECURITY;

INSERT INTO quick_requests (request_text, station)
SELECT r.request_text, r.station
FROM (VALUES
  ('Less ice', 'bar'),
  ('No ice', 'bar'),
  ('Less sweet', 'bar'),
  ('Extra hot', 'bar'),
  ('Spicy', 'kitchen'),
  ('Not spicy', 'kitchen'),
  ('Sauce on the side', 'kitchen'),
  ('Well done', 'kitchen')
) AS r(request_text, station)
WHERE NOT EXISTS (
  SELECT 1 FROM quick_requests q WHERE LOWER(q.request_text) = LOWER(r.request_text) AND q.station = r.station
);

COMMIT;
