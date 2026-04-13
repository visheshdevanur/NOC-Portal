-- 0010_semesters_schema.sql

-- ==========================================
-- 1. DATA CLEANSING (Purge un-semestered data)
-- ==========================================
-- To prevent foreign key constraint nightmares, we will wipe the dummy data out.
DELETE FROM subject_enrollment;
DELETE FROM department_clearance;
DELETE FROM subjects;
DELETE FROM profiles WHERE role = 'student';

-- ==========================================
-- 2. CREATE SEMESTERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, department_id)
);

ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read semesters" ON semesters 
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert semesters" ON semesters 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff' AND profiles.department_id = semesters.department_id)
  );

CREATE POLICY "Staff can delete semesters" ON semesters 
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff' AND profiles.department_id = semesters.department_id)
  );

-- ==========================================
-- 3. MODIFY SUBJECTS & PROFILES
-- ==========================================
ALTER TABLE subjects ADD COLUMN semester_id UUID REFERENCES semesters(id) ON DELETE CASCADE NOT NULL;

-- For students, attach them to a semester
ALTER TABLE profiles ADD COLUMN semester_id UUID REFERENCES semesters(id) ON DELETE SET NULL;
