-- 0041_staff_department_logs.sql
-- Allow Staff to view activity logs for faculty/teacher users within their department

CREATE POLICY "Staff view department faculty logs" 
ON public.activity_logs FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'staff' 
    AND department_id = activity_logs.department_id
  )
  AND activity_logs.user_role IN ('faculty', 'teacher')
);
