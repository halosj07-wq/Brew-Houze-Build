-- Brew Houze café database, 2 of 3: the built-in rows
-- Exported 2026-10-06 by deploy-tools/export-cafe-database.mjs
-- Run in the SQL editor of the new Supabase project, after the files before it

BEGIN;

-- Store settings (ai-insights, delivery-setup, id-discounts and kitchen-stations migrations)
INSERT INTO public.store_settings (setting_key, setting_value) VALUES
  ('ai_insights_enabled', 'false'),
  ('delivery_enabled', 'false'), ('delivery_start', ''), ('delivery_end', ''), ('delivery_max_active', ''), ('delivery_free_above', ''),
  ('cod_enabled', 'false'), ('cod_max_amount', '1000'), ('cod_min_orders', '1'),
  ('vat_registered', 'true'), ('vat_rate', '12'),
  ('pickup_mode', 'together');

-- The built-in discounts, senior and PWD on as the law requires (id-discounts migration)
INSERT INTO public.discount_types (code, name, discount_kind, discount_value, vat_exempt, requires_id, id_label, is_active, sort_order) VALUES
  ('senior', 'Senior Citizen', 'percent', 20, TRUE, TRUE, 'OSCA or senior citizen ID no.', TRUE, 1),
  ('pwd', 'PWD', 'percent', 20, TRUE, TRUE, 'PWD ID no.', TRUE, 2),
  ('student', 'Student', 'percent', 10, FALSE, TRUE, 'Student ID no.', FALSE, 3),
  ('employee', 'Employee meal', 'percent', 20, FALSE, FALSE, NULL, FALSE, 4);

-- The treasury accounts (treasury and treasury-paymongo migrations)
INSERT INTO public.treasury_accounts (name, kind) VALUES ('Safe', 'safe'), ('PayMongo', 'ewallet');

-- The default quick requests (quick-requests migration)
INSERT INTO public.quick_requests (request_text, station) VALUES
  ('Less ice', 'bar'), ('No ice', 'bar'), ('Less sweet', 'bar'), ('Extra hot', 'bar'),
  ('Spicy', 'kitchen'), ('Not spicy', 'kitchen'), ('Sauce on the side', 'kitchen'), ('Well done', 'kitchen');

COMMIT;
