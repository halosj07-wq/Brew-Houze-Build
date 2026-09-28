-- ID verification migration (counter-less ID discounts on the mobile menu)
--
-- A mobile customer claiming a senior, PWD or other ID discount takes a photo of their ID. The
-- cashier checks it on the POS and approves or rejects it. Once approved, the customer pays with
-- GCash on their phone, and the barista checks the real ID at pickup.
--
-- 1. id_verifications: one request per claim. The photo is kept only while it waits: it is
--    deleted as soon as the cashier decides, the customer cancels, or the request expires, and
--    never kept longer than a day. The name and ID number stay, like any ID discount.
--      pending -> approved -> used        paid, order_id set
--      pending -> rejected                reject_reason says why
--      pending or approved -> cancelled   the customer took it back
--      pending or approved -> expired     not checked, or not paid, in time
-- 2. customers: a remembered ID. When a signed-in customer asks, an approved check is saved to
--    their account (the discount, name and ID number, never the photo), so their next orders get
--    the discount right away. The admin can remove it in Customers.
-- 3. payment_checkouts: id_verification_id, the approval a GCash payment uses (marked used once paid).
--
-- Personal data: ID photos of seniors and PWDs are sensitive personal information under the
-- Data Privacy Act. They are only readable by signed-in staff through the POS and are deleted
-- as described above.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS id_verifications (
  verification_id SERIAL PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
  discount_type_id INTEGER REFERENCES discount_types(discount_type_id) ON DELETE SET NULL,
  holder_name TEXT NOT NULL,
  id_number TEXT,
  items JSONB NOT NULL,
  -- lines: the items that belong to the holder (indexes into items). NULL with group_size: a shared bill.
  lines JSONB,
  group_size INTEGER CHECK (group_size IS NULL OR group_size BETWEEN 1 AND 50),
  service_type TEXT CHECK (service_type IS NULL OR service_type IN ('dine_in', 'take_out')),
  photo BYTEA,
  photo_type TEXT,
  remember BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'used')),
  reject_reason TEXT,
  decided_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  order_id INTEGER REFERENCES sales_orders(order_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_id_verifications_status ON id_verifications (status, created_at);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_discount_type_id INTEGER REFERENCES discount_types(discount_type_id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_discount_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_discount_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_verified_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;

ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS id_verification_id INTEGER REFERENCES id_verifications(verification_id) ON DELETE SET NULL;

ALTER TABLE id_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON id_verifications FROM anon, authenticated;
