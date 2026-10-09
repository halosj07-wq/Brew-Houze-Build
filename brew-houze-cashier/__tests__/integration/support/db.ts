import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client, Pool } from "pg";

// The test database: rebuilt from the schema files before every run (so each run starts from the
// same state), then filled with a small café (seed below). Never the live database: env.ts refuses
// a database whose name does not contain "test".

const ssl = (env: NodeJS.ProcessEnv) => ({ rejectUnauthorized: true, ...(env.DB_CA ? { ca: env.DB_CA } : {}) });
const config = (env: NodeJS.ProcessEnv, database: string) => ({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database, ssl: ssl(env) });

export const PASSWORD = "Test#Pass2026";
// A browser that was already trusted (signed in with the emailed code before) for each account.
export const DEVICE = { admin: "devAdminTrusted000000001", cashier: "devCashierTrusted0000001", barista: "devBaristaTrusted0000001", rider: "devRiderTrusted000000001", customer: "devCustomerTrusted000001" };
export const OTP_EMAIL = "halosj07@gmail.com";

export async function rebuildDatabase(env: NodeJS.ProcessEnv) {
  const name = String(env.DB_NAME);
  const admin = new Client(config(env, "postgres"));
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const db = new Client(config(env, name));
  await db.connect();
  // What a Supabase project has before the schema: the extensions schema and its roles.
  await db.query(`
    CREATE SCHEMA IF NOT EXISTS extensions;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    ALTER DATABASE "${name}" SET search_path = public, extensions;
    ALTER DATABASE "${name}" SET timezone = 'UTC';
    SET search_path = public, extensions;
  `);
  for (const file of ["01-schema.sql", "02-built-in-rows.sql", "03-gcash-direct-migration.sql"]) {
    await db.query(readFileSync(path.join(__dirname, "..", "schema", file), "utf8"));
  }
  await db.query(SEED);
  for (const [account, device] of Object.entries(DEVICE)) {
    const kind = account === "customer" ? "customer" : "staff";
    const id = account === "customer" ? "(SELECT customer_id FROM customers WHERE username = 'ana_test')" : `(SELECT admin_id FROM admin_users WHERE email = '${account}@test.brewhouze.local')`;
    await db.query(`INSERT INTO trusted_devices (account_kind, account_id, device_hash, device_label, trusted_until) VALUES ($1, ${id}, $2, 'Test runner', CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [kind, createHash("sha256").update(device).digest("hex")]);
  }
  await db.end();
}

export function testPool(env: NodeJS.ProcessEnv) {
  return new Pool({ ...config(env, String(env.DB_NAME)), max: 3 });
}

// The café: staff of every role, a menu with recipes, stock (Caramel Syrup close to its low-stock
// level), a delivery zone, a loyalty campaign (1 star per order, 5 a day, a Free Drink for 10), AI
// insights switched on and the safe and PayMongo account in use.
const SEED = `
SET search_path = public, extensions;
INSERT INTO admin_users (full_name, email, password_hash, role, is_active, can_void_orders, can_refund_orders, can_open_shift, can_close_shift) VALUES
  ('Test Admin', 'admin@test.brewhouze.local', crypt('${PASSWORD}', gen_salt('bf')), 'admin', TRUE, TRUE, TRUE, TRUE, TRUE),
  ('Test Cashier', 'cashier@test.brewhouze.local', crypt('${PASSWORD}', gen_salt('bf')), 'cashier', TRUE, TRUE, TRUE, TRUE, TRUE),
  ('Test Barista', 'barista@test.brewhouze.local', crypt('${PASSWORD}', gen_salt('bf')), 'barista', TRUE, FALSE, FALSE, FALSE, FALSE),
  ('Test Rider', 'rider@test.brewhouze.local', crypt('${PASSWORD}', gen_salt('bf')), 'rider', TRUE, FALSE, FALSE, FALSE, FALSE),
  ('Test New Device', '${OTP_EMAIL}', crypt('${PASSWORD}', gen_salt('bf')), 'cashier', TRUE, FALSE, FALSE, FALSE, FALSE);

INSERT INTO product_categories (category_name, is_active) VALUES ('Coffee', TRUE), ('Pastries', TRUE);
INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, unit_cost, is_customizable, is_whole_unit) VALUES
  ('Coffee', 'Espresso Beans', 'g', 1000, 200, 1.20, FALSE, FALSE),
  ('Dairy', 'Fresh Milk', 'ml', 2000, 500, 0.10, TRUE, FALSE),
  ('Syrups', 'Caramel Syrup', 'ml', 115, 100, 0.50, TRUE, FALSE),
  ('Pastries', 'Croissant', 'pc', 20, 5, 25.00, FALSE, TRUE);
INSERT INTO products (product_name, product_category, price, product_type, station, is_archived) VALUES
  ('Spanish Latte', 'Coffee', 120, 'recipe', 'bar', FALSE),
  ('Americano', 'Coffee', 100, 'recipe', 'bar', FALSE),
  ('Butter Croissant', 'Pastries', 75, 'stock', 'kitchen', FALSE);
INSERT INTO product_variants (product_id, size_label, price, temperature) VALUES
  ((SELECT product_id FROM products WHERE product_name = 'Spanish Latte'), '16 oz', 120, 'cold'),
  ((SELECT product_id FROM products WHERE product_name = 'Americano'), '12 oz', 100, 'hot'),
  ((SELECT product_id FROM products WHERE product_name = 'Butter Croissant'), 'Regular', 75, NULL);
INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity) VALUES
  (1, (SELECT inventory_id FROM inventory WHERE item_name = 'Espresso Beans'), 18),
  (1, (SELECT inventory_id FROM inventory WHERE item_name = 'Fresh Milk'), 150),
  (1, (SELECT inventory_id FROM inventory WHERE item_name = 'Caramel Syrup'), 15),
  (2, (SELECT inventory_id FROM inventory WHERE item_name = 'Espresso Beans'), 18),
  (3, (SELECT inventory_id FROM inventory WHERE item_name = 'Croissant'), 1);
INSERT INTO additions (addition_name, inventory_id, quantity, price, station, is_active) VALUES
  ('Extra Shot', (SELECT inventory_id FROM inventory WHERE item_name = 'Espresso Beans'), 18, 25, 'bar', TRUE);

INSERT INTO delivery_zones (name, description, fee, min_order, is_active, sort_order) VALUES ('Poblacion', 'Town proper', 50, NULL, TRUE, 1);
UPDATE store_settings SET setting_value = CASE setting_key
  WHEN 'delivery_enabled' THEN 'true' WHEN 'delivery_start' THEN '00:00' WHEN 'delivery_end' THEN '23:59'
  WHEN 'cod_enabled' THEN 'true' WHEN 'cod_min_orders' THEN '0' WHEN 'ai_insights_enabled' THEN 'true' ELSE setting_value END;

INSERT INTO customers (username, full_name, email, password_hash, is_active, consented_at, consent_version, phone)
  VALUES ('ana_test', 'Ana Test', 'ana.customer@test.brewhouze.local', crypt('${PASSWORD}', gen_salt('bf')), TRUE, CURRENT_TIMESTAMP, '1', '09171234567');
INSERT INTO loyalty_campaigns (name, starts_on, is_active, earn_mode, stars_per_unit, max_stars_per_order, max_stars_per_day, kind, activated_at)
  VALUES ('Brew Stars', CURRENT_DATE - 1, TRUE, 'per_order', 1, 1, 5, 'seasonal', CURRENT_TIMESTAMP);
INSERT INTO loyalty_rewards (campaign_id, name, stars_cost, category, max_price, is_active, reward_type)
  VALUES ((SELECT campaign_id FROM loyalty_campaigns WHERE name = 'Brew Stars'), 'Free Drink', 10, 'Coffee', 150, TRUE, 'free_item');

UPDATE treasury_accounts SET opened_at = CURRENT_TIMESTAMP, balance = CASE kind WHEN 'safe' THEN 5000 ELSE 0 END WHERE name IN ('Safe', 'PayMongo');
`;
