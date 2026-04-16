-- 0028_attendance_fee_pipeline.sql
-- Adds attendance fee tracking to subject_enrollment
-- Pipeline: Faculty → department_review → hod_review → cleared

-- ============================================================
-- 0. ADD 'accounts_review' TO clearance_stage ENUM (kept for compatibility)
-- ============================================================
ALTER TYPE clearance_stage ADD VALUE IF NOT EXISTS 'accounts_review' AFTER 'faculty_review';

-- ============================================================
-- 1. ADD ATTENDANCE FEE COLUMNS TO subject_enrollment
-- ============================================================
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS attendance_fee NUMERIC DEFAULT 0;
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS attendance_fee_verified BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 2. ALLOW ACCOUNTS ROLE TO UPDATE subject_enrollment (for fee tracking)
-- ============================================================
DROP POLICY IF EXISTS "Accounts can verify attendance fees" ON subject_enrollment;
CREATE POLICY "Accounts can verify attendance fees" ON subject_enrollment
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'accounts')
  );

DROP POLICY IF EXISTS "Accounts can view subject_enrollment" ON subject_enrollment;
CREATE POLICY "Accounts can view subject_enrollment" ON subject_enrollment
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('accounts', 'admin'))
  );

-- ============================================================
-- 3. UPDATE evaluate_clearance_stage() TRIGGER FUNCTION
--    Flow: faculty_review → department_review → hod_review → cleared
--    (No accounts_review step)
-- ============================================================
CREATE OR REPLACE FUNCTION evaluate_clearance_stage()
RETURNS TRIGGER AS $$
DECLARE
  req record;
  pending_faculty INT;
  rejected_faculty INT;
  pending_dues INT;
BEGIN
  -- Prevent evaluating if no student_id
  IF NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO req FROM clearance_requests WHERE student_id = NEW.student_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Count faculty clearance status
  SELECT COUNT(*) INTO pending_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id AND status != 'completed';
  
  SELECT COUNT(CASE WHEN status='rejected' THEN 1 END) INTO rejected_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id;

  -- Count college dues
  SELECT COUNT(*) INTO pending_dues
  FROM student_dues WHERE student_id = NEW.student_id AND status != 'completed';

  -- Phase 1: Faculty Review
  IF req.current_stage = 'faculty_review' THEN
    IF rejected_faculty > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Teacher flagged attendance shortfall' WHERE id = req.id;
    ELSIF pending_faculty = 0 THEN
       -- All subjects cleared by faculty, move to department_review
       UPDATE clearance_requests SET current_stage = 'department_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  -- Refresh req record after possible update
  SELECT * INTO req FROM clearance_requests WHERE id = req.id;

  -- Phase 2: Department Review (College Dues)
  IF req.current_stage = 'department_review' THEN
    IF pending_dues = 0 THEN
       UPDATE clearance_requests SET current_stage = 'hod_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RE-ATTACH TRIGGERS (idempotent)
-- ============================================================
DROP TRIGGER IF EXISTS trg_evaluate_clearance_dues ON student_dues;
CREATE TRIGGER trg_evaluate_clearance_dues
AFTER UPDATE ON student_dues
FOR EACH ROW
EXECUTE FUNCTION evaluate_clearance_stage();

DROP TRIGGER IF EXISTS trg_evaluate_clearance ON subject_enrollment;
CREATE TRIGGER trg_evaluate_clearance
AFTER UPDATE ON subject_enrollment
FOR EACH ROW
EXECUTE FUNCTION evaluate_clearance_stage();

-- ============================================================
-- 5. FIX ANY STUDENTS STUCK IN accounts_review (move them forward)
-- ============================================================
UPDATE clearance_requests 
SET current_stage = 'department_review' 
WHERE current_stage = 'accounts_review';
