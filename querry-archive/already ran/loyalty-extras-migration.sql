-- Loyalty extras migration: stars per order, discount rewards, birthday campaign
--
-- 1. Stars per order. earn_mode gains per_order (stars for each qualifying order), with an
--    optional minimum spend (min_order_amount).
-- 2. Discount rewards. A reward is either a free item (as before) or a discount: percent or a
--    fixed peso amount off the order (or only off items of one category), with an optional cap
--    and minimum order. Orders keep the discount in generic columns (subtotal_amount,
--    discount_amount, discount_label, discount_source), ready for PWD and senior discounts later.
--    total_amount stays what the customer paid.
-- 3. Birthday campaign. campaigns get a kind: seasonal (as before) or birthday. A birthday campaign
--    has no end date and can be switched off and on at any time. It runs next to the seasonal one
--    (one of each kind can be on). Its rewards cost no stars and each customer gets one per year,
--    within birthday_window of their birthday: on the day, within 3 days (week) or the month.
--    Birthday treats given are kept in loyalty_birthday_claims.
--
-- Existing campaigns, rewards and orders keep working unchanged.
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE loyalty_campaigns DROP CONSTRAINT IF EXISTS loyalty_campaigns_earn_mode_check;
ALTER TABLE loyalty_campaigns ADD CONSTRAINT loyalty_campaigns_earn_mode_check CHECK (earn_mode IN ('per_item', 'per_amount', 'per_order'));
ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10, 2) CHECK (min_order_amount IS NULL OR min_order_amount >= 0);
ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'seasonal' CHECK (kind IN ('seasonal', 'birthday'));
ALTER TABLE loyalty_campaigns ADD COLUMN IF NOT EXISTS birthday_window TEXT CHECK (birthday_window IS NULL OR birthday_window IN ('day', 'week', 'month'));

-- One campaign of each kind can be switched on.
DROP INDEX IF EXISTS loyalty_campaigns_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_campaigns_one_active_kind ON loyalty_campaigns (kind) WHERE is_active;

ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'free_item' CHECK (reward_type IN ('free_item', 'discount'));
ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS discount_kind TEXT CHECK (discount_kind IS NULL OR discount_kind IN ('percent', 'fixed'));
ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10, 2) CHECK (discount_value IS NULL OR discount_value > 0);
ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS max_discount NUMERIC(10, 2) CHECK (max_discount IS NULL OR max_discount > 0);
ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10, 2) CHECK (min_order_amount IS NULL OR min_order_amount >= 0);
-- Birthday rewards cost no stars.
ALTER TABLE loyalty_rewards DROP CONSTRAINT IF EXISTS loyalty_rewards_stars_cost_check;
ALTER TABLE loyalty_rewards ADD CONSTRAINT loyalty_rewards_stars_cost_check CHECK (stars_cost BETWEEN 0 AND 1000);

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10, 2);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_label TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_source TEXT CHECK (discount_source IS NULL OR discount_source IN ('reward', 'birthday', 'pwd', 'senior', 'promo'));
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_reward_id INTEGER REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
-- A GCash payment remembers the discount reward until it is paid and the order is created.
ALTER TABLE payment_checkouts ADD COLUMN IF NOT EXISTS discount_reward_id INTEGER REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;

-- Birthday treats given: one used claim per customer per year. A voided or refunded order marks
-- its claim returned, so the customer can still get their treat.
CREATE TABLE IF NOT EXISTS loyalty_birthday_claims (
  birthday_claim_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES loyalty_campaigns(campaign_id),
  reward_id INTEGER REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES sales_orders(order_id) ON DELETE SET NULL,
  claim_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'used' CHECK (status IN ('used', 'returned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_birthday_one_per_year ON loyalty_birthday_claims (customer_id, claim_year) WHERE status = 'used';
CREATE INDEX IF NOT EXISTS idx_loyalty_birthday_claims_campaign ON loyalty_birthday_claims (campaign_id, created_at);

ALTER TABLE loyalty_birthday_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_birthday_claims FROM anon, authenticated;
