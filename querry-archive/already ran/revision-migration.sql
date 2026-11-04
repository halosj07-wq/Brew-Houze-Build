-- Revision for the redemo (2026-11-04). Run once in the Supabase SQL editor, on each database.
-- Safe to run again: every statement checks first.
--
-- 1. The audit log: every change made in the Admin Portal and the admin who made it (Security, Audit log tab).
-- 2. Delivery tracking: where each delivery goes (found from its address on the map), where its rider is now
--    (sent from the rider phone while delivering), and the photo the rider takes at the door as proof.
-- The cafe location on the delivery map is a store setting (cafe_lat and cafe_lng), set from the Delivery page.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  admin_name TEXT,
  area TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_area ON admin_audit_log (area, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log (admin_id, created_at DESC);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dest_lat NUMERIC(9, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dest_lng NUMERIC(9, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dest_located_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS rider_lat NUMERIC(9, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS rider_lng NUMERIC(9, 6);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS rider_accuracy NUMERIC(8, 1);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS rider_seen_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS proof_photo BYTEA;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS proof_mime TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS proof_taken_at TIMESTAMPTZ;

-- 4. Stock groups: related items kept together in the stock list (Cups: 8 oz, 12 oz, 16 oz cups, Straws, Lids).
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS item_group TEXT;

-- 3. Bundle deals on promo posts: the menu items sold together (2 to 6) and the price for all of them.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS bundle_product_ids INTEGER[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS bundle_price NUMERIC(10, 2);
