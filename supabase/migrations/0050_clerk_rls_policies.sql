-- 0050_clerk_rls_policies.sql
-- Grant 'clerk' role the same permissions as 'staff' across all relevant tables
-- to fix row-level security policy violations when creating/updating users, subjects, etc.

-- 1. Profiles
DROP POLICY IF EXISTS "Clerk can insert profiles" ON profiles;
CREATE POLICY "Clerk can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'clerk')
    AND role IN ('student', 'teacher', 'faculty')
  );

DROP POLICY IF EXISTS "Clerk can update profiles" ON profiles;
CREATE POLICY "Clerk can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'clerk')
  );

-- 2. Subjects
DROP POLICY IF EXISTS "Clerk can insert subjects" ON subjects;
CREATE POLICY "Clerk can insert subjects" ON subjects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk' AND profiles.department_id = subjects.department_id)
  );

DROP POLICY IF EXISTS "Clerk can update subjects" ON subjects;
CREATE POLICY "Clerk can update subjects" ON subjects
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk' AND profiles.department_id = subjects.department_id)
  );

DROP POLICY IF EXISTS "Clerk can delete subjects" ON subjects;
CREATE POLICY "Clerk can delete subjects" ON subjects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk' AND profiles.department_id = subjects.department_id)
  );

-- 3. Subject Enrollment
DROP POLICY IF EXISTS "Clerk can insert subject_enrollment" ON subject_enrollment;
CREATE POLICY "Clerk can insert subject_enrollment" ON subject_enrollment
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

DROP POLICY IF EXISTS "Clerk can update subject_enrollment" ON subject_enrollment;
CREATE POLICY "Clerk can update subject_enrollment" ON subject_enrollment
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

DROP POLICY IF EXISTS "Clerk can delete subject_enrollment" ON subject_enrollment;
CREATE POLICY "Clerk can delete subject_enrollment" ON subject_enrollment
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

-- 4. Student Dues
DROP POLICY IF EXISTS "Clerk can update dues" ON student_dues;
CREATE POLICY "Clerk can update dues" ON student_dues
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

-- 5. IA Attendance
DROP POLICY IF EXISTS "Admin HOD Staff can view all ia_attendance" ON ia_attendance;
CREATE POLICY "Admin HOD Staff can view all ia_attendance" ON ia_attendance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hod', 'staff', 'clerk', 'coe', 'principal'))
  );

-- 6. Activity Logs
DROP POLICY IF EXISTS "Clerks view department logs" ON public.activity_logs;
CREATE POLICY "Clerks view department logs" 
ON public.activity_logs FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'clerk' 
    AND department_id = activity_logs.department_id
  )
);
