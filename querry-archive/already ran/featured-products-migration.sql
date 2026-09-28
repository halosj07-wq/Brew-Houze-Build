-- Featured products migration (new mobile menu layout)
--
-- The mobile menu opens with Barista Featured Specials: products the admin picks in Admin, Menu,
-- Featured, each with an optional badge (for example Customer Favorites or Houze Favorites)
-- and a position in the list.
--
-- Run in the Supabase SQL editor before deploying the matching code.
-- Written so it also runs in consoles that split scripts on every semicolon: no semicolons or
-- quote marks inside strings or comments. Safe to run more than once.

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_label TEXT CHECK (badge_label IS NULL OR length(badge_label) BETWEEN 1 AND 30);
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_order INTEGER NOT NULL DEFAULT 0;
