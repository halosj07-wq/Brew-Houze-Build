# Setting up the café's database

The café deployment (Brew Houze Deployed, the `cafe` branch) uses its own Supabase project. It
starts empty: the same structure as the current database, the built-in rows the apps expect, and
the admin accounts. No menu, inventory, orders, shifts, customers, other staff or logs.

## 1. Export

From the Brew Houze Build folder:

```sh
node deploy-tools/export-cafe-database.mjs
```

It reads the database in `brew-houze-admin/.env.local` (read only) and writes `deploy-tools/out/`,
which is kept out of git (the admin file holds password hashes).

## 2. Create the Supabase project

New project, region **Southeast Asia (Singapore)**, a strong database password (keep it safe).
Security: Data API off, automatically expose new tables off, automatic RLS on.

## 3. Run the files in its SQL editor, in order

1. `01-schema.sql`: every table, default, constraint, index, function and view, with row-level security on
2. `02-built-in-rows.sql`: the store settings (AI insights and delivery off, VAT 12%), the built-in discounts (senior and PWD on), the treasury's Safe and PayMongo accounts, and the default quick requests
3. `03-admin-accounts.sql`: the admin accounts, with the same passwords as now

Each file runs as one transaction: if one fails, nothing from it is saved, and it can be run again
after fixing the problem. Delete `03-admin-accounts.sql` once it has run.

## 4. Afterwards, in the café admin app

- Sign in (the emailed code is asked once on each new device).
- Add the menu, inventory, add-ons and staff accounts.
- Set delivery, VAT and the other settings for the café.
