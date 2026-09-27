-- View security migration (Supabase linter: Security Definer View)
--
-- shift_summaries ran with the permissions of its owner, so reading it through the Supabase
-- Data API skipped row level security on the tables behind it. With security_invoker the view
-- uses the permissions of whoever queries it, and the public API roles lose access entirely.
--
-- The apps connect as the owner (postgres), which row level security does not apply to, so
-- they keep working unchanged.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Any later CREATE OR REPLACE VIEW
-- of shift_summaries must keep WITH (security_invoker = true) and the REVOKE below.

ALTER VIEW shift_summaries SET (security_invoker = true);

REVOKE ALL ON shift_summaries FROM anon, authenticated;
