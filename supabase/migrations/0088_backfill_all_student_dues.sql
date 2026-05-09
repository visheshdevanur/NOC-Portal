-- 0088_backfill_all_student_dues.sql
-- Ensure ALL students have records in student_dues and library_dues tables.
-- This fixes students not appearing in Library and Accounts dashboards.
-- Also ensures promoted students remain visible.

-- 1. Backfill missing student_dues records
INSERT INTO student_dues (student_id)
SELECT id FROM profiles WHERE role = 'student'
ON CONFLICT (student_id) DO NOTHING;

-- 2. Backfill missing library_dues records
INSERT INTO library_dues (student_id, has_dues, fine_amount)
SELECT id, FALSE, 0 FROM profiles WHERE role = 'student'
ON CONFLICT (student_id) DO NOTHING;

-- 3. Recreate the student_dues trigger to also handle library_dues in one shot
CREATE OR REPLACE FUNCTION trg_setup_student_dues()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'student' THEN
    INSERT INTO student_dues (student_id)
    VALUES (NEW.id)
    ON CONFLICT (student_id) DO NOTHING;

    INSERT INTO library_dues (student_id, has_dues, fine_amount)
    VALUES (NEW.id, FALSE, 0)
    ON CONFLICT (student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Drop the separate library_dues trigger since it's now handled by the combined one
DROP TRIGGER IF EXISTS trg_setup_library_dues_trigger ON profiles;
