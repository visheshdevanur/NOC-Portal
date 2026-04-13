-- 0006_departments_and_roles.sql

-- Drop dependent constraints and columns
ALTER TABLE department_clearance DROP CONSTRAINT IF EXISTS department_clearance_student_id_dept_type_key;
ALTER TABLE department_clearance DROP COLUMN IF EXISTS dept_type;

-- 1. Create dynamic departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  hod_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read departments" ON departments FOR SELECT USING (true);
CREATE POLICY "Admin can insert departments" ON departments FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can update departments" ON departments FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can delete departments" ON departments FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- 2. Modify Profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS department_id;
ALTER TABLE profiles ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN section TEXT; -- For students

-- 3. Modify Subjects (link to department)
ALTER TABLE subjects ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE CASCADE;

-- RLS for Staff creating subjects
DROP POLICY IF EXISTS "Staff can insert subjects" ON subjects;
CREATE POLICY "Staff can insert subjects" ON subjects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff' AND profiles.department_id = subjects.department_id)
  );

DROP POLICY IF EXISTS "Staff can update subjects" ON subjects;
CREATE POLICY "Staff can update subjects" ON subjects
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff' AND profiles.department_id = subjects.department_id)
  );

DROP POLICY IF EXISTS "Staff can delete subjects" ON subjects;
CREATE POLICY "Staff can delete subjects" ON subjects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff' AND profiles.department_id = subjects.department_id)
  );

-- 4. Modify Department Clearance
ALTER TABLE department_clearance ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE CASCADE;
-- Add a unique constraint for student and department so a student can only have 1 clearance row per dept
ALTER TABLE department_clearance ADD CONSTRAINT department_clearance_student_dept_unique UNIQUE(student_id, department_id);

-- Staff needs to read clearances matching their department
DROP POLICY IF EXISTS "Staff can select all dept clearances" ON department_clearance;
CREATE POLICY "Staff can select all dept clearances" ON department_clearance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff' AND profiles.department_id = department_clearance.department_id)
  );

DROP POLICY IF EXISTS "Staff can update dept clearances" ON department_clearance;
CREATE POLICY "Staff can update dept clearances" ON department_clearance
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff' AND profiles.department_id = department_clearance.department_id)
  );

-- 5. Additional profile creation logic (for custom user management without Edge Functions)
-- In real systems, you can't insert into auth.users easily. Since this is purely using Supabase client to signup,
-- The profiles RLS needs to allow HOD to create STAFF, and STAFF to create TEACHERS/STUDENTS.
DROP POLICY IF EXISTS "HOD can insert profiles" ON profiles;
CREATE POLICY "HOD can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'hod')
    AND role = 'staff'
  );

DROP POLICY IF EXISTS "Staff can insert profiles" ON profiles;
CREATE POLICY "Staff can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
    AND role IN ('student', 'faculty')
  );

-- Admin was already given insert access in previous migrations

-- Allow Admin, HOD, and Staff to UPDATE profiles so they can assign them to departments and sections
DROP POLICY IF EXISTS "HOD can update profiles" ON profiles;
CREATE POLICY "HOD can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'hod')
  );

DROP POLICY IF EXISTS "Staff can update profiles" ON profiles;
CREATE POLICY "Staff can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
  );
