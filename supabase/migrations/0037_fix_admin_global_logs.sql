-- 0037_fix_admin_global_logs.sql
-- Fixes the System Activity Logs access policies to grant Admins global visibility
-- while explicitly stripping out any 'student' activity trails.

DROP POLICY IF EXISTS "Principals view all logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins view only their own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins and Principals view global logs" ON public.activity_logs;

CREATE POLICY "Admins and Principals view global logs" 
ON public.activity_logs FOR SELECT TO authenticated 
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'principal'))
  AND user_role IS DISTINCT FROM 'student'
);
