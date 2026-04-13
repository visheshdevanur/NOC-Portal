-- 0008_rbac_hierarchy.sql
-- Tighten RLS policies for strict RBAC hierarchy

-- ============================================================
-- 1. Fix Admin profile insertion — Admin can ONLY create HODs
-- ============================================================
DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;
CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    AND role = 'hod'
  );

-- ============================================================
-- 2. Fix HOD profile insertion — HOD can create Staff AND Teachers
-- ============================================================
DROP POLICY IF EXISTS "HOD can insert profiles" ON profiles;
CREATE POLICY "HOD can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'hod')
    AND role IN ('staff', 'teacher', 'faculty')
  );

-- ============================================================
-- 3. Fix Staff profile insertion — Staff can create Teachers AND Students
-- ============================================================
DROP POLICY IF EXISTS "Staff can insert profiles" ON profiles;
CREATE POLICY "Staff can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
    AND role IN ('student', 'teacher', 'faculty')
  );

-- ============================================================
-- 4. HOD subject management — CRUD on own department subjects
-- ============================================================
DROP POLICY IF EXISTS "HOD can insert subjects" ON subjects;
CREATE POLICY "HOD can insert subjects" ON subjects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod' AND profiles.department_id = subjects.department_id)
  );

DROP POLICY IF EXISTS "HOD can update subjects" ON subjects;
CREATE POLICY "HOD can update subjects" ON subjects
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod' AND profiles.department_id = subjects.department_id)
  );

DROP POLICY IF EXISTS "HOD can delete subjects" ON subjects;
CREATE POLICY "HOD can delete subjects" ON subjects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod' AND profiles.department_id = subjects.department_id)
  );

-- ============================================================
-- 5. HOD deletion — HOD can delete staff/teachers in their dept
-- ============================================================
DROP POLICY IF EXISTS "HOD can delete profiles" ON profiles;
CREATE POLICY "HOD can delete profiles" ON profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'hod'
        AND profiles.department_id = p.department_id
        AND profiles.role IN ('staff', 'teacher', 'faculty')
    )
  );

-- ============================================================
-- 6. Staff deletion — Staff can delete teachers/students in their dept
-- ============================================================
DROP POLICY IF EXISTS "Staff can delete profiles" ON profiles;
CREATE POLICY "Staff can delete profiles" ON profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'staff'
        AND profiles.department_id = p.department_id
        AND profiles.role IN ('student', 'teacher', 'faculty')
    )
  );

-- ============================================================
-- 7. Staff can insert subject_enrollment (for section assignment)
-- ============================================================
DROP POLICY IF EXISTS "Staff can insert subject_enrollment" ON subject_enrollment;
CREATE POLICY "Staff can insert subject_enrollment" ON subject_enrollment
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- ============================================================
-- 8. Staff can delete subject_enrollment
-- ============================================================
DROP POLICY IF EXISTS "Staff can delete subject_enrollment" ON subject_enrollment;
CREATE POLICY "Staff can delete subject_enrollment" ON subject_enrollment
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- ============================================================
-- 9. HOD can view all subject_enrollment (for oversight)
-- ============================================================
DROP POLICY IF EXISTS "HOD can view all subject_enrollment" ON subject_enrollment;
CREATE POLICY "HOD can view all subject_enrollment" ON subject_enrollment
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod')
  );
