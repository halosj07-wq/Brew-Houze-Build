-- Supabase advisor fixes (warnings)
--
-- 1. Duplicate indexes: two identical indexes on the same column only slow down writes and use
--    space. One of each pair is dropped, the other keeps doing the same job. No app code refers
--    to these index names.
--      admin_users        lower(email) unique   keeps admin_users_email_lower_unique_idx
--      product_additions  addition_id           keeps product_additions_addition_id_idx
--
-- 2. current_open_shift_id() is the column default that stamps the open shift on attendance
--    (employee_time_logs) and stock changes (inventory_log). Pinning its search_path makes it
--    always find the public shifts table, whoever calls it. Its behaviour does not change.
--
-- Run in the Supabase SQL editor. Safe to run more than once.

DROP INDEX IF EXISTS public.admin_users_email_unique;

DROP INDEX IF EXISTS public.product_additions_addition_idx;

ALTER FUNCTION public.current_open_shift_id() SET search_path = public, pg_temp;
