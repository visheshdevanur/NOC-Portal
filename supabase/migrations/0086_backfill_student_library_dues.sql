-- 0086_backfill_student_library_dues.sql
-- Ensures every student has both a student_dues and library_dues record.
-- Students without records don't appear in Accounts/Library dashboards.

-- 1. Backfill missing student_dues records
INSERT INTO student_dues (student_id)
SELECT p.id FROM profiles p
LEFT JOIN student_dues sd ON sd.student_id = p.id
WHERE p.role = 'student' AND sd.id IS NULL;

-- 2. Backfill missing library_dues records
INSERT INTO library_dues (student_id, has_dues)
SELECT p.id, TRUE FROM profiles p
LEFT JOIN library_dues ld ON ld.student_id = p.id
WHERE p.role = 'student' AND ld.id IS NULL;

-- 3. Update the trigger to create BOTH records when a student profile is created
CREATE OR REPLACE FUNCTION trg_setup_student_dues()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'student' THEN
        -- Create student_dues record (college fee)
        INSERT INTO student_dues (student_id)
        VALUES (NEW.id)
        ON CONFLICT (student_id) DO NOTHING;
        
        -- Create library_dues record (default: has_dues = true = pending)
        INSERT INTO library_dues (student_id, has_dues)
        VALUES (NEW.id, TRUE)
        ON CONFLICT (student_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ensure trigger is attached
DROP TRIGGER IF EXISTS trg_setup_student_dues_trigger ON profiles;
CREATE TRIGGER trg_setup_student_dues_trigger
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION trg_setup_student_dues();
