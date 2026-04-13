-- 0005_admin_quick_actions.sql

-- ============================================================
-- 1. Allow Admin to fully manage subjects
-- ============================================================
DROP POLICY IF EXISTS "Admin can insert subjects" ON subjects;
CREATE POLICY "Admin can insert subjects" ON subjects
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin can update subjects" ON subjects;
CREATE POLICY "Admin can update subjects" ON subjects
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin can delete subjects" ON subjects;
CREATE POLICY "Admin can delete subjects" ON subjects
  FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 2. Allow Admin to delete users from profiles
-- ============================================================
DROP POLICY IF EXISTS "Admin can delete profiles" ON profiles;
CREATE POLICY "Admin can delete profiles" ON profiles
  FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 3. Allow Staff to manage subject_enrollments (to assign teachers)
-- ============================================================
DROP POLICY IF EXISTS "Staff can view all subject_enrollment" ON subject_enrollment;
CREATE POLICY "Staff can view all subject_enrollment" ON subject_enrollment
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));

DROP POLICY IF EXISTS "Staff can update subject_enrollment" ON subject_enrollment;
CREATE POLICY "Staff can update subject_enrollment" ON subject_enrollment
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));

-- ============================================================
-- 4. Allow Student to insert subject_enrollment without teacher
-- ============================================================
DROP POLICY IF EXISTS "Students can insert own subject_enrollment" ON subject_enrollment;
CREATE POLICY "Students can insert own subject_enrollment" ON subject_enrollment
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can delete own subject_enrollment" ON subject_enrollment;
CREATE POLICY "Students can delete own subject_enrollment" ON subject_enrollment
  FOR DELETE USING (student_id = auth.uid());

-- Fix department clearance insert for new workflows
DROP POLICY IF EXISTS "Students can insert own department_clearance" ON department_clearance;
CREATE POLICY "Students can insert own department_clearance" ON department_clearance
  FOR INSERT WITH CHECK (student_id = auth.uid());
