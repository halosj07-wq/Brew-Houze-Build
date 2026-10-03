-- Attendance fix: time signed in before a shift opened
--
-- Someone signed in to the Staff Portal before the shift opened kept their earlier sign-in time
-- when the shift opened (for example 4:06 PM in a shift that opened at 6:08 PM). Their attendance
-- for a shift now starts when the shift opens. This corrects the past records the same way. The
-- apps already do this for new shifts.
--
-- Run in the Supabase SQL editor. Safe to run again.

UPDATE employee_time_logs t
SET time_in = s.opened_at
FROM shifts s
WHERE t.shift_id = s.shift_id
  AND t.time_in < s.opened_at;
