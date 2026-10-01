-- AI insights migration
--
-- Short predictive warnings and advice for the owner, written by Claude (the Anthropic API) from
-- the cafe numbers, only when an admin presses the button on the Insights page (never in the
-- background). The admin app works the numbers out itself (sales and profit against the period
-- before, how long stock lasts at its current pace, slow sellers, waste, fees, expenses, drawer
-- shortages) and sends only those numbers. No customer or staff personal details are sent.
--
-- 1. ai_insights: every result, kept so it can be read again without asking Claude again:
--      period_start, period_end  the business days it looked at
--      facts                     the numbers that were sent (JSON)
--      cards                     what came back: 3 to 5 cards, each with a tone (warning, good or
--                                tip), a title, a message and the page it is about (JSON)
--      model, input_tokens, output_tokens  what it used, to see what it costs
--      requested_by, created_at  who asked and when
--
-- 2. store_settings ai_insights_enabled: the on and off switch on the Insights page. It starts off.
--    While it is off, the admin app sends nothing to Claude.
--
-- The API key itself is never stored here. It goes in the admin app environment as
-- ANTHROPIC_API_KEY (.env.local and the Vercel project settings).
--
-- Run in the Supabase SQL editor before deploying the matching admin app code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

CREATE TABLE IF NOT EXISTS ai_insights (
  insight_id SERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  facts JSONB NOT NULL,
  cards JSONB NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  requested_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_insights_period CHECK (period_start <= period_end)
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_created ON ai_insights (created_at DESC);

INSERT INTO store_settings (setting_key, setting_value) VALUES ('ai_insights_enabled', 'false') ON CONFLICT (setting_key) DO NOTHING;

-- Keeps the table out of the Supabase Data API. The app connects as the owner and is not affected.
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_insights FROM anon, authenticated;
