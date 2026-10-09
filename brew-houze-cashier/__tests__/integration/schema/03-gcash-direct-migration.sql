-- Direct GCash QR payments: the customer pays the cafe GCash QR and the cashier confirms each payment
-- Used by the cafe deployment (GCASH_METHOD=direct_qr). The defense build keeps PayMongo.
-- Run on BOTH databases (Brew Houze Build and Brew Houze Deployed) so their structure stays the same.
-- Safe to run again.

-- A mobile checkout is paid through PayMongo (as before) or straight to the cafe GCash QR
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paymongo';
ALTER TABLE payment_checkouts DROP CONSTRAINT IF EXISTS payment_checkouts_provider_check;
ALTER TABLE payment_checkouts ADD CONSTRAINT payment_checkouts_provider_check CHECK (provider IN ('paymongo', 'gcash_direct'));

-- What the customer sends after paying: the GCash reference number and a screenshot of the receipt
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS proof BYTEA;
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS proof_mime TEXT;
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- The cashier who confirmed or rejected it, and when
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- A new step between paying and the order: sent by the customer, waiting for the cashier
ALTER TABLE payment_checkouts DROP CONSTRAINT IF EXISTS payment_checkouts_status_check;
ALTER TABLE payment_checkouts ADD CONSTRAINT payment_checkouts_status_check
  CHECK (status IN ('awaiting_payment', 'awaiting_confirmation', 'completed', 'failed', 'cancelled', 'refunded', 'needs_attention'));
CREATE INDEX IF NOT EXISTS idx_payment_checkouts_to_confirm ON payment_checkouts (submitted_at) WHERE status = 'awaiting_confirmation';

-- Each GCash reference number pays for one order only
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_checkouts_gcash_reference ON payment_checkouts (reference_number)
  WHERE provider = 'gcash_direct' AND reference_number IS NOT NULL AND status NOT IN ('failed', 'cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_gcash_reference ON sales_orders (payment_reference)
  WHERE payment_provider = 'gcash_direct';

-- The treasury account the confirmed GCash payments go into (no fees, no payouts)
INSERT INTO treasury_accounts (name, kind)
SELECT 'GCash', 'ewallet'
WHERE NOT EXISTS (SELECT 1 FROM treasury_accounts WHERE LOWER(name) = 'gcash');
