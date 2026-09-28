-- Loyalty campaigns migration (loyalty Phase 3, with the columns Phase 4 needs)
--
-- Brew Houze runs its loyalty program in seasons. The admin sets each season up as a campaign:
--   loyalty_campaigns      name, dates, the on/off switch, how stars are earned (per item or per
--                          amount spent, which categories count), limits per order and per day,
--                          and whether stars carry over to the next campaign or expire.
--                          At most one campaign is switched on at a time.
--   loyalty_rewards        what stars buy in a campaign (a free product, or any item from a
--                          category up to a price) and how many stars each costs.
--   loyalty_star_entries   every star given or taken, never edited or deleted:
--                            earned       stars from a completed order
--                            reversed     taken back when that order is voided or refunded
--                            adjusted     added or removed by the admin, with a reason
--                                         (for example stars from the old paper cards)
--                            carried_out  balance moved out of a campaign that carries over
--                            carried_in   the same balance arriving in the next campaign
--                            redeemed     spent on a reward (Phase 4)
--                            restored     given back when a reward order is voided (Phase 4)
--                          A balance is the sum of a customers entries in a campaign.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS loyalty_campaigns (
  campaign_id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description TEXT,
  starts_on DATE NOT NULL,
  ends_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  earn_mode TEXT NOT NULL DEFAULT 'per_item' CHECK (earn_mode IN ('per_item', 'per_amount')),
  stars_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (stars_per_unit BETWEEN 1 AND 100),
  amount_step NUMERIC(10, 2) CHECK (amount_step IS NULL OR amount_step > 0),
  eligible_categories TEXT[],
  max_stars_per_order INTEGER CHECK (max_stars_per_order IS NULL OR max_stars_per_order > 0),
  max_stars_per_day INTEGER CHECK (max_stars_per_day IS NULL OR max_stars_per_day > 0),
  carry_over BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (earn_mode <> 'per_amount' OR amount_step IS NOT NULL)
);

-- Only one campaign can be switched on.
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_campaigns_one_active ON loyalty_campaigns ((TRUE)) WHERE is_active;

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  reward_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES loyalty_campaigns(campaign_id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  stars_cost INTEGER NOT NULL CHECK (stars_cost BETWEEN 1 AND 1000),
  product_id INTEGER REFERENCES products(product_id) ON DELETE SET NULL,
  category TEXT,
  max_price NUMERIC(10, 2) CHECK (max_price IS NULL OR max_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_campaign ON loyalty_rewards (campaign_id, sort_order);

CREATE TABLE IF NOT EXISTS loyalty_star_entries (
  entry_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES loyalty_campaigns(campaign_id),
  kind TEXT NOT NULL CHECK (kind IN ('earned', 'reversed', 'adjusted', 'carried_out', 'carried_in', 'redeemed', 'restored')),
  stars INTEGER NOT NULL CHECK (stars <> 0),
  order_id INTEGER REFERENCES sales_orders(order_id) ON DELETE SET NULL,
  reward_id INTEGER REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL,
  reason TEXT,
  admin_id INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_entries_customer ON loyalty_star_entries (customer_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_entries_campaign ON loyalty_star_entries (campaign_id, created_at);
-- An order earns stars once, and has them taken back at most once.
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_entries_one_earned ON loyalty_star_entries (order_id) WHERE kind = 'earned';
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_entries_one_reversed ON loyalty_star_entries (order_id) WHERE kind = 'reversed';

-- Keeps the new tables out of the Supabase Data API. The apps connect as the owner and are not affected.
ALTER TABLE loyalty_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_star_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_campaigns FROM anon, authenticated;
REVOKE ALL ON loyalty_rewards FROM anon, authenticated;
REVOKE ALL ON loyalty_star_entries FROM anon, authenticated;
