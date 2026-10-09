-- Promotions and events (Objective 9): posts the admin writes for customers, shown on the Mobile
-- Menu as a banner and in its notification bell while they are scheduled to show. A promo is an
-- offer or a new item; an event has its own date and time (and disappears once it is over).
-- Run once in the Supabase SQL editor, on Build and on the café's database.
--
--   kind             'promo' or 'event'
--   title, message   what the customer reads (title up to 80 characters, message up to 400)
--   image_data       an optional picture, resized by the Admin Portal before upload (served by
--                    /api/promotions/[id]/image, like the product photos)
--   product_id       an optional menu item the post points to ("Try our new ...")
--   event_*          when the event happens (required for events; the end is optional)
--   show_from/until  when the post is shown (until is optional)
--   is_active        switched on or off by the admin
--   archived_*       archived posts are kept as history and never shown
--   email_customers  the admin asked to email the post to subscribed customers when it goes live;
--                    emailed_at / emailed_count record that it was sent (once)
--
-- Customers choose whether to get these emails (customers.promo_emails, off until they switch it
-- on in their account); every email has a one-tap unsubscribe link.

CREATE TABLE IF NOT EXISTS promotions (
  promotion_id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('promo', 'event')),
  title VARCHAR(80) NOT NULL CHECK (LENGTH(BTRIM(title)) > 0),
  message TEXT NOT NULL CHECK (LENGTH(BTRIM(message)) > 0 AND LENGTH(message) <= 400),
  image_data BYTEA,
  image_mime_type TEXT,
  product_id INTEGER REFERENCES products(product_id) ON DELETE SET NULL,
  event_starts_at TIMESTAMPTZ,
  event_ends_at TIMESTAMPTZ,
  show_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  show_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_customers BOOLEAN NOT NULL DEFAULT FALSE,
  emailed_at TIMESTAMPTZ,
  emailed_count INTEGER,
  archived_at TIMESTAMPTZ,
  archived_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES admin_users(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT promotions_event_time CHECK (kind <> 'event' OR event_starts_at IS NOT NULL),
  CONSTRAINT promotions_event_order CHECK (event_ends_at IS NULL OR event_ends_at >= event_starts_at),
  CONSTRAINT promotions_show_order CHECK (show_until IS NULL OR show_until > show_from)
);

-- The Mobile Menu asks for the posts that are on and not archived, by start time.
CREATE INDEX IF NOT EXISTS promotions_showing_idx ON promotions (show_from) WHERE is_active AND archived_at IS NULL;

-- Customers who asked for promo and event emails, and when they last switched it.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS promo_emails BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS promo_emails_changed_at TIMESTAMPTZ;

-- Keeps the table out of the Supabase Data API. The app connects as the owner and is not affected.
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON promotions FROM anon, authenticated;
