-- 0068_fyc_attendance_categories_rls.sql
-- Allow FYC role to manage attendance_fine_categories across all departments.
-- FYC is a global first-year coordinator that needs to set fine categories
-- that apply to all branches for Sem 1 & 2.

-- SELECT
DROP POLICY IF EXISTS "Dept roles can view categories" ON attendance_fine_categories;
CREATE POLICY "Dept roles can view categories" ON attendance_fine_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'hod', 'admin', 'fyc')
        AND (department_id = attendance_fine_categories.department_id OR role IN ('admin', 'fyc'))
    )
  );

-- INSERT
DROP POLICY IF EXISTS "Staff/Clerk can create categories" ON attendance_fine_categories;
CREATE POLICY "Staff/Clerk can create categories" ON attendance_fine_categories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'admin', 'fyc')
        AND (department_id = attendance_fine_categories.department_id OR role IN ('admin', 'fyc'))
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "Staff/Clerk can update categories" ON attendance_fine_categories;
CREATE POLICY "Staff/Clerk can update categories" ON attendance_fine_categories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'admin', 'fyc')
        AND (department_id = attendance_fine_categories.department_id OR role IN ('admin', 'fyc'))
    )
  );

-- DELETE
DROP POLICY IF EXISTS "Staff/Clerk can delete categories" ON attendance_fine_categories;
CREATE POLICY "Staff/Clerk can delete categories" ON attendance_fine_categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'admin', 'fyc')
        AND (department_id = attendance_fine_categories.department_id OR role IN ('admin', 'fyc'))
    )
  );
