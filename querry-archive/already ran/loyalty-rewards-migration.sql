-- Loyalty rewards migration (loyalty Phase 4: claiming rewards)
--
-- Customers spend stars on rewards:
--   * On the mobile menu, a signed-in customer adds a reward to their cart.
--   * At the counter, the customer scans the printed Stars sign with their phone and picks a
--     reward (or just asks to be added to the order). The claim waits in loyalty_claims until
--     the cashier accepts it, which attaches the customer and the reward to the order.
--     Regulars without an app login redeem with the cashier confirming their own password.
--
-- A reward is an order line priced at 0. reward_id marks it, reward_value keeps its normal
-- price for reports, and unit_cost still counts, so profit stays accurate. The stars are
-- taken as a redeemed entry when the order is placed, and given back (restored) if the order
-- is voided or refunded.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS reward_id INTEGER REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS reward_value NUMERIC(10, 2);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_reward ON sales_order_items (reward_id) WHERE reward_id IS NOT NULL;

-- A claim made by scanning the Stars sign at the counter:
--   pending   waiting for the cashier (expires after 10 minutes)
--   accepted  the cashier took it into the current order (expires if that order is not placed)
--   used      the order was placed
--   cancelled declined by the cashier, cancelled by the customer, or replaced by a new claim
-- reward_id is empty when the customer only asked to be added to the order.
CREATE TABLE IF NOT EXISTS loyalty_claims (
  claim_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES loyalty_campaigns(campaign_id),
  reward_id INTEGER REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'used', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES sales_orders(order_id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loyalty_claims_open ON loyalty_claims (status, expires_at) WHERE status IN ('pending', 'accepted');
CREATE INDEX IF NOT EXISTS idx_loyalty_claims_customer ON loyalty_claims (customer_id, created_at);

ALTER TABLE loyalty_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_claims FROM anon, authenticated;
