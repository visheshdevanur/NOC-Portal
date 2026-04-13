-- 0012_accounts_tables.sql
-- Step 2: Create student_dues table and accounts infrastructure
-- (Run AFTER 0011 has been committed)

-- 1. Add roll_number to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roll_number TEXT UNIQUE;

-- 2. Drop the old trigger and function that enforced department_clearances
DROP TRIGGER IF EXISTS trg_setup_student_clearance_trigger ON profiles;
DROP FUNCTION IF EXISTS trg_setup_student_clearance();

-- 3. Nuke legacy department_clearances
DROP TABLE IF EXISTS department_clearance CASCADE;

-- 4. Create new global student_dues table
CREATE TABLE IF NOT EXISTS student_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  fine_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending or completed
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS setup for student_dues
ALTER TABLE student_dues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read student_dues" ON student_dues 
  FOR SELECT USING (true);

-- Only Accounts users can manage dues
CREATE POLICY "Accounts can manage dues" ON student_dues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'accounts')
  );

-- 5. Recreate trigger to populate student_dues instead!
CREATE OR REPLACE FUNCTION trg_setup_student_dues()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'student' THEN
    INSERT INTO student_dues (student_id)
    VALUES (NEW.id)
    ON CONFLICT (student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_setup_student_dues_trigger
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION trg_setup_student_dues();

-- Retroactively fix mapping for existing students since we dropped the table
INSERT INTO student_dues (student_id)
SELECT id FROM profiles WHERE role = 'student'
ON CONFLICT (student_id) DO NOTHING;
