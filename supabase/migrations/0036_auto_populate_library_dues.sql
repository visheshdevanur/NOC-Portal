-- 0036_auto_populate_library_dues.sql

-- 1. Create function to automatically insert a library_dues tracker for new students
CREATE OR REPLACE FUNCTION trg_setup_library_dues()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'student' THEN
    INSERT INTO library_dues (student_id)
    VALUES (NEW.id)
    ON CONFLICT (student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach trigger to profiles
DROP TRIGGER IF EXISTS trg_setup_library_dues_trigger ON profiles;
CREATE TRIGGER trg_setup_library_dues_trigger
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION trg_setup_library_dues();

-- 3. Retroactively populate library_dues for all existing students
INSERT INTO library_dues (student_id)
SELECT id FROM profiles WHERE role = 'student'
ON CONFLICT (student_id) DO NOTHING;
