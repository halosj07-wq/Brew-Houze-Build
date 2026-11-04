-- Bundles (2026-11-04): a menu item made of other menu items, sold together at one price (a combo, as in fast food).
-- Run once in the Supabase SQL editor, on each database. Safe to run again.
-- The bundle keeps its items here. Its own recipe is the items recipes added up, so selling one takes their stock,
-- and the queue shows each item at its own station (the drink at the bar, the food in the kitchen).

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_product_type;
ALTER TABLE products ADD CONSTRAINT chk_products_product_type CHECK (product_type IN ('recipe', 'stock', 'bundle'));

CREATE TABLE IF NOT EXISTS product_bundle_items (
  bundle_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  product_variant_id INTEGER NOT NULL REFERENCES product_variants(product_variant_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bundle_id, product_variant_id)
);
CREATE INDEX IF NOT EXISTS idx_product_bundle_items_variant ON product_bundle_items (product_variant_id);
ALTER TABLE product_bundle_items ENABLE ROW LEVEL SECURITY;
