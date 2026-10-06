// Exports this database's structure (the one in brew-houze-admin/.env.local) as SQL files for a new,
// empty Supabase project: the café's own database (see deploy-tools/README.md). It only reads from
// this database; you run the files it writes in the new project's SQL editor, in order.
//
//   node deploy-tools/export-cafe-database.mjs
//
// Writes deploy-tools/out/:
//   01-schema.sql          every table, column, default, constraint, index, function, view, the
//                          row-level security and the grants, exactly as here (no data)
//   02-built-in-rows.sql   the rows the migrations create and the apps expect, at their defaults: the
//                          store settings, the built-in discounts (senior and PWD on), the treasury's
//                          Safe and PayMongo accounts, and the default quick requests
//   03-admin-accounts.sql  the admin accounts (role admin only), with their passwords as they are
// The café starts with no menu, inventory, orders, shifts, customers, other staff or logs. The
// admin file holds password hashes: deploy-tools/out/ is kept out of git.

import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminApp = path.join(here, "..", "brew-houze-admin");
const require = createRequire(path.join(adminApp, "package.json"));
require("@next/env").loadEnvConfig(adminApp);
const { Pool } = require("pg");

const ROLES = ["anon", "authenticated", "service_role"];

const pool = new Pool({
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true, ...(process.env.DB_CA ? { ca: process.env.DB_CA } : {}) },
});
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const id = (name) => `"${String(name).replace(/"/g, '""')}"`;
const header = (title) => `-- ${title}\n-- Exported ${new Date().toISOString().slice(0, 10)} by deploy-tools/export-cafe-database.mjs\n-- Run in the SQL editor of the new Supabase project, after the files before it\n\n`;

async function schema() {
  const out = [];
  const tables = (await q(`
    SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname
  `));
  const extensions = await q(`SELECT extname, extnamespace::regnamespace::text AS ns FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp')`);
  out.push("-- Extensions (Supabase projects already have these, this makes sure)");
  for (const ext of extensions) out.push(`CREATE EXTENSION IF NOT EXISTS ${id(ext.extname)} WITH SCHEMA ${id(ext.ns)};`);

  out.push("\n-- Number sequences (the ID counters)");
  for (const s of await q(`SELECT sequencename, data_type, start_value, increment_by, min_value, max_value, cycle FROM pg_sequences WHERE schemaname = 'public' ORDER BY 1`)) {
    out.push(`CREATE SEQUENCE IF NOT EXISTS public.${id(s.sequencename)} AS ${s.data_type} INCREMENT BY ${s.increment_by} MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START WITH ${s.start_value}${s.cycle ? " CYCLE" : ""};`);
  }

  // Tables first without their defaults (a default may call a function that reads a table).
  out.push("\n-- Tables");
  const defaults = [];
  for (const t of tables) {
    const cols = await q(`
      SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, a.attgenerated, pg_get_expr(d.adbin, d.adrelid) AS expr
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum
    `, [t.oid]);
    const lines = cols.map((c) => {
      const generated = c.attgenerated === "s" ? ` GENERATED ALWAYS AS (${c.expr}) STORED` : "";
      if (c.expr && c.attgenerated !== "s") defaults.push(`ALTER TABLE public.${id(t.relname)} ALTER COLUMN ${id(c.attname)} SET DEFAULT ${c.expr};`);
      return `  ${id(c.attname)} ${c.type}${generated}${c.attnotnull ? " NOT NULL" : ""}`;
    });
    out.push(`CREATE TABLE public.${id(t.relname)} (\n${lines.join(",\n")}\n);`);
  }

  out.push("\n-- Functions");
  for (const f of await q(`
    SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') ORDER BY p.proname
  `)) out.push(`${f.def.trim()};`);

  out.push("\n-- Column defaults");
  out.push(...defaults);

  out.push("\n-- Sequences belong to their columns");
  for (const s of await q(`
    SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col
    FROM pg_depend d JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S' JOIN pg_class t ON t.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = s.relnamespace WHERE n.nspname = 'public' AND d.deptype IN ('a', 'i') ORDER BY 1
  `)) out.push(`ALTER SEQUENCE public.${id(s.seq)} OWNED BY public.${id(s.tbl)}.${id(s.col)};`);

  // Keys, unique and check constraints, then the foreign keys (once every table exists).
  const constraints = await q(`
    SELECT c.conname, cl.relname, c.contype, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND cl.relkind = 'r' AND c.contype IN ('p', 'u', 'c', 'x', 'f')
    ORDER BY CASE c.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'x' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, cl.relname, c.conname
  `);
  out.push("\n-- Keys and checks");
  for (const c of constraints.filter((entry) => entry.contype !== "f")) out.push(`ALTER TABLE public.${id(c.relname)} ADD CONSTRAINT ${id(c.conname)} ${c.def};`);
  out.push("\n-- Links between tables");
  for (const c of constraints.filter((entry) => entry.contype === "f")) out.push(`ALTER TABLE public.${id(c.relname)} ADD CONSTRAINT ${id(c.conname)} ${c.def};`);

  out.push("\n-- Indexes");
  for (const i of await q(`
    SELECT pg_get_indexdef(i.indexrelid) AS def FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relkind = 'r' AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
    ORDER BY 1
  `)) out.push(`${i.def};`);

  out.push("\n-- Views");
  for (const v of await q(`
    SELECT c.relname, c.reloptions, pg_get_viewdef(c.oid, true) AS def FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' ORDER BY 1
  `)) out.push(`CREATE VIEW public.${id(v.relname)}${v.reloptions?.length ? ` WITH (${v.reloptions.join(", ")})` : ""} AS\n${v.def.trim().replace(/;$/, "")};`);

  out.push("\n-- Row-level security (on for every table, as here)");
  for (const t of tables) {
    if (t.relrowsecurity) out.push(`ALTER TABLE public.${id(t.relname)} ENABLE ROW LEVEL SECURITY;`);
    if (t.relforcerowsecurity) out.push(`ALTER TABLE public.${id(t.relname)} FORCE ROW LEVEL SECURITY;`);
  }
  for (const p of await q(`SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`)) {
    out.push(`CREATE POLICY ${id(p.policyname)} ON public.${id(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(id).join(", ")}${p.qual ? ` USING (${p.qual})` : ""}${p.with_check ? ` WITH CHECK (${p.with_check})` : ""};`);
  }

  // Grants for Supabase's API roles, exactly as here (tables, views, sequences and functions).
  out.push("\n-- What the Supabase API roles may touch (as here)");
  const objects = await q(`
    SELECT c.relname AS name, CASE c.relkind WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END AS kind, c.relacl::text[] AS acl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'S') ORDER BY 1
  `);
  const letters = { TABLE: { a: "INSERT", r: "SELECT", w: "UPDATE", d: "DELETE", D: "TRUNCATE", x: "REFERENCES", t: "TRIGGER" }, SEQUENCE: { r: "SELECT", w: "UPDATE", U: "USAGE" } };
  for (const o of objects) {
    out.push(`REVOKE ALL ON ${o.kind} public.${id(o.name)} FROM ${ROLES.join(", ")};`);
    for (const entry of o.acl ?? []) {
      const [grantee, rights] = entry.split("/")[0].split("=");
      if (!ROLES.includes(grantee)) continue;
      const privileges = [...rights.replace(/\*/g, "")].map((letter) => letters[o.kind][letter]).filter(Boolean);
      if (privileges.length) out.push(`GRANT ${privileges.join(", ")} ON ${o.kind} public.${id(o.name)} TO ${grantee};`);
    }
  }
  for (const f of await q(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proacl::text[] AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  `)) {
    out.push(`REVOKE ALL ON FUNCTION public.${id(f.proname)}(${f.args}) FROM PUBLIC, ${ROLES.join(", ")};`);
    for (const entry of f.acl ?? [`=X/postgres`]) {
      const [grantee, rights] = entry.split("/")[0].split("=");
      if (rights.includes("X")) out.push(`GRANT EXECUTE ON FUNCTION public.${id(f.proname)}(${f.args}) TO ${grantee === "" ? "PUBLIC" : grantee};`);
    }
  }
  return { sql: header("Brew Houze café database, 1 of 3: the structure") + "BEGIN;\n\n" + out.join("\n") + "\n\nCOMMIT;\n", tables: tables.length };
}

// The rows the migrations insert (querry-archive), at their defaults: the apps expect them.
function builtInRows() {
  return header("Brew Houze café database, 2 of 3: the built-in rows") + `BEGIN;

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
`;
}

// The admin accounts, with their passwords as they are (so they sign in the same way). The ID
// numbers start from 1 in the new database.
async function adminAccounts() {
  const cols = ["full_name", "email", "password_hash", "role", "is_active", "can_void_orders", "can_refund_orders", "can_open_shift", "can_close_shift"];
  const rows = await q(`SELECT ${cols.map((c) => `quote_nullable(${id(c)}::text) AS ${id(c)}`).join(", ")} FROM public.admin_users WHERE LOWER(role) = 'admin' ORDER BY admin_id`);
  const sql = header(`Brew Houze café database, 3 of 3: the ${rows.length} admin accounts`) + "-- This file holds password hashes, keep it private and delete it once it has run\n\nBEGIN;\n\n"
    + rows.map((row) => `INSERT INTO public.admin_users (${cols.map(id).join(", ")}) VALUES (${cols.map((c) => row[c]).join(", ")});`).join("\n")
    + "\n\nCOMMIT;\n";
  return { sql, count: rows.length };
}

try {
  const outDir = path.join(here, "out");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const s = await schema();
  writeFileSync(path.join(outDir, "01-schema.sql"), s.sql);
  writeFileSync(path.join(outDir, "02-built-in-rows.sql"), builtInRows());
  const a = await adminAccounts();
  writeFileSync(path.join(outDir, "03-admin-accounts.sql"), a.sql);
  console.log(`Wrote deploy-tools/out: ${s.tables} tables, the built-in rows, ${a.count} admin accounts.`);
} catch (error) {
  console.error("Export failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
