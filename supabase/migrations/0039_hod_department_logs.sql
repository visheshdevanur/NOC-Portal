-- 0039_hod_department_logs.sql
-- Allow HODs to view activity logs for users within their department

CREATE POLICY "HODs view department logs" 
ON public.activity_logs FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'hod' 
    AND department_id = activity_logs.department_id
  )
);
