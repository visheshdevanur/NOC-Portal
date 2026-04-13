-- 0009_student_clearance_trigger.sql
-- Fix: Students not appearing in Staff Dashboard due to missing department_clearance record

-- 1. Create a function that automatically generates a clearance tracking row for every new student
CREATE OR REPLACE FUNCTION trg_setup_student_clearance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'student' AND NEW.department_id IS NOT NULL THEN
    INSERT INTO department_clearance (student_id, department_id)
    VALUES (NEW.id, NEW.department_id)
    ON CONFLICT (student_id, department_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger to the profiles table
DROP TRIGGER IF EXISTS trg_setup_student_clearance_trigger ON profiles;
CREATE TRIGGER trg_setup_student_clearance_trigger
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION trg_setup_student_clearance();

-- 3. Retroactively fix any broken students you created earlier today so they instantly appear!
INSERT INTO department_clearance (student_id, department_id)
SELECT id, department_id FROM profiles 
WHERE role = 'student' AND department_id IS NOT NULL
ON CONFLICT (student_id, department_id) DO NOTHING;
