-- Enums
CREATE TYPE user_role AS ENUM ('student', 'faculty', 'staff', 'hod', 'admin');
CREATE TYPE dept_type AS ENUM ('library', 'hostel', 'accounts');
CREATE TYPE clearance_status AS ENUM ('pending', 'rejected', 'completed');

-- Profiles
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role user_role DEFAULT 'student'::user_role NOT NULL,
  department_id TEXT
);

-- Subjects
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_name TEXT NOT NULL,
  subject_code TEXT UNIQUE NOT NULL
);

-- Subject Enrollment
CREATE TABLE subject_enrollment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  attendance_pct DECIMAL,
  is_faculty_cleared BOOLEAN DEFAULT FALSE,
  remarks TEXT,
  UNIQUE(student_id, subject_id)
);

-- Department Clearance
CREATE TABLE department_clearance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  dept_type dept_type NOT NULL,
  is_dept_cleared BOOLEAN DEFAULT FALSE,
  fine_amount DECIMAL DEFAULT 0,
  UNIQUE(student_id, dept_type)
);

-- Clearance Master
CREATE TABLE clearance_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  hod_approved BOOLEAN DEFAULT FALSE,
  status clearance_status DEFAULT 'pending'::clearance_status
);

-- Row Level Security (RLS) Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_clearance ENABLE ROW LEVEL SECURITY;
ALTER TABLE clearance_master ENABLE ROW LEVEL SECURITY;

-- Profiles:
CREATE POLICY "Users can read all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Subjects:
CREATE POLICY "Anyone can read subjects" ON subjects FOR SELECT USING (true);

-- Subject Enrollment (Faculty & Students)
CREATE POLICY "Faculty can update their own subjects" ON subject_enrollment
  FOR UPDATE USING (teacher_id = auth.uid());
CREATE POLICY "Faculty can see their students" ON subject_enrollment
  FOR SELECT USING (teacher_id = auth.uid());
CREATE POLICY "Students can see their own enrollments" ON subject_enrollment
  FOR SELECT USING (student_id = auth.uid());
  
-- Department Clearance (Staff & Students)
CREATE POLICY "Staff can select all dept clearances" ON department_clearance
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));
CREATE POLICY "Staff can update dept clearances" ON department_clearance
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));
CREATE POLICY "Students can see their own dept clearances" ON department_clearance
  FOR SELECT USING (student_id = auth.uid());

-- Clearance Master
CREATE POLICY "HOD can view all" ON clearance_master
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod'));
CREATE POLICY "HOD can update" ON clearance_master
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod'));
CREATE POLICY "Students can view their own status" ON clearance_master
  FOR SELECT USING (student_id = auth.uid());

-- Triggers for HOD notification
CREATE OR REPLACE FUNCTION check_clearances()
RETURNS TRIGGER AS $$
DECLARE
  faculty_pending INT;
  dept_pending INT;
BEGIN
  -- Count how many pending clearances exist for the student
  SELECT COUNT(*) INTO faculty_pending FROM subject_enrollment 
    WHERE student_id = NEW.student_id AND is_faculty_cleared = false;
  
  SELECT COUNT(*) INTO dept_pending FROM department_clearance
    WHERE student_id = NEW.student_id AND is_dept_cleared = false;
    
  -- If both are 0, they are fully cleared by all teachers and departments
  IF faculty_pending = 0 AND dept_pending = 0 THEN
    -- Update or Insert into clearance_master
    INSERT INTO clearance_master (student_id, status)
    VALUES (NEW.student_id, 'completed')
    ON CONFLICT (student_id) DO UPDATE SET status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_faculty_clearance
AFTER UPDATE OF is_faculty_cleared ON subject_enrollment
FOR EACH ROW EXECUTE FUNCTION check_clearances();

CREATE TRIGGER trg_dept_clearance
AFTER UPDATE OF is_dept_cleared ON department_clearance
FOR EACH ROW EXECUTE FUNCTION check_clearances();
