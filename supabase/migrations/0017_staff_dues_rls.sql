-- 0017_staff_dues_rls.sql
-- Allow staff members to manage college dues for students in their department

CREATE POLICY "Staff can update dues" ON student_dues
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );
