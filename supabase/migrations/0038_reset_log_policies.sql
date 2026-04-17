-- 0038_reset_log_policies.sql
-- Resets and simplifies the system activity log policies exactly as requested:
-- 1. Admin gets pure global logs (excluding students)
-- 2. Everyone else (except students) ONLY see their own logs

-- Drop absolutely all prior activity_log SELECT policies
DROP POLICY IF EXISTS "Principals view all logs" ON public.activity_logs;
DROP POLICY IF EXISTS "HODs view their dept and admin logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins view only their own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users view only their own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins and Principals view global logs" ON public.activity_logs;

-- Policy 1: Admin Global View
CREATE POLICY "Admins view global logs" 
ON public.activity_logs FOR SELECT TO authenticated 
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  AND user_role IS DISTINCT FROM 'student'
);

-- Policy 2: Everyone else views their own logs
CREATE POLICY "All other users view own logs" 
ON public.activity_logs FOR SELECT TO authenticated 
USING (
  -- As long as they are not an admin (admins use the global rule above)
  -- and they are not a student
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role NOT IN ('admin', 'student'))
  AND auth.uid() = activity_logs.user_id
);
