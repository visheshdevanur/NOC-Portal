-- 0048_admin_semester_rls.sql
-- Allow admin to insert and delete semesters for any department
-- Also allow clerk and HOD to manage semesters in their department

-- Update insert policy to include admin (any dept), clerk, and hod
DROP POLICY IF EXISTS "Staff can insert semesters" ON semesters;
CREATE POLICY "Authorized roles can insert semesters" ON semesters
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND (
        role = 'admin'
        OR (role IN ('staff', 'clerk', 'hod') AND profiles.department_id = semesters.department_id)
      )
    )
  );

-- Update delete policy similarly
DROP POLICY IF EXISTS "Staff can delete semesters" ON semesters;
CREATE POLICY "Authorized roles can delete semesters" ON semesters
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND (
        role = 'admin'
        OR (role IN ('staff', 'clerk', 'hod') AND profiles.department_id = semesters.department_id)
      )
    )
  );
