-- 0003_demo_rls.sql

-- Allow students to insert their own subject enrollments for the demo
CREATE POLICY "Students can insert own enrollments" ON subject_enrollment
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- Allow students to insert their own department clearances for the demo  
CREATE POLICY "Students can insert own dept clearances" ON department_clearance
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- Ensure Staff can see all students in their department
-- Actually, the profiles relation might be blocked if staff can't read profiles. 
-- In 0001, we have: CREATE POLICY "Users can read all profiles" ON profiles FOR SELECT USING (true);
-- So profiles are readable.

-- Ensure Staff can update department_clearance
-- In 0001: CREATE POLICY "Staff can update dept clearances" ON department_clearance FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));

-- Ensure Faculty can update subject_enrollment
-- In 0001: CREATE POLICY "Faculty can update their own subjects" ON subject_enrollment FOR UPDATE USING (teacher_id = auth.uid());
