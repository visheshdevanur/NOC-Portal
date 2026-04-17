-- 0033_library_dues_schema.sql

-- ============================================================
-- 1. CREATE library_dues TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS library_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  has_dues BOOLEAN DEFAULT FALSE,
  fine_amount NUMERIC DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. SETUP ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE library_dues ENABLE ROW LEVEL SECURITY;

-- Librarians and Admins can do everything
CREATE POLICY "Librarians and Admins full access to library_dues" ON library_dues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('librarian', 'admin', 'principal'))
  );

-- Students can view their own library dues
CREATE POLICY "Students can view own library_dues" ON library_dues
  FOR SELECT USING (
    student_id = auth.uid()
  );

-- Other roles can view for clearance purposes
CREATE POLICY "HOD COE Staff accounts can view library_dues" ON library_dues
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('hod', 'coe', 'staff', 'accounts'))
  );

-- ============================================================
-- 3. TRIGGER FOR UPDATED_AT
-- ============================================================
DROP TRIGGER IF EXISTS trg_library_dues_updated_at ON library_dues;
CREATE TRIGGER trg_library_dues_updated_at
BEFORE UPDATE ON library_dues
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 4. UPDATE evaluate_clearance_stage() TRIGGER FUNCTION
--    Flow: faculty_review -> library_review -> department_review (accounts) -> hod_review -> cleared
-- ============================================================
CREATE OR REPLACE FUNCTION evaluate_clearance_stage()
RETURNS TRIGGER AS $$
DECLARE
  req record;
  pending_faculty INT;
  rejected_faculty INT;
  pending_library INT;
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

  -- Count library dues
  SELECT COUNT(*) INTO pending_library
  FROM library_dues WHERE student_id = NEW.student_id AND has_dues = TRUE;

  -- Count college dues (Fixed: previously referenced status instead of has_dues)
  SELECT COUNT(*) INTO pending_dues
  FROM student_dues WHERE student_id = NEW.student_id AND has_dues = TRUE;

  -- Phase 1: Faculty Review
  IF req.current_stage = 'faculty_review' THEN
    IF rejected_faculty > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Teacher flagged attendance shortfall' WHERE id = req.id;
    ELSIF pending_faculty = 0 THEN
       -- All subjects cleared by faculty, move to library_review
       UPDATE clearance_requests SET current_stage = 'library_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  SELECT * INTO req FROM clearance_requests WHERE id = req.id;

  -- Phase 2: Library Review
  IF req.current_stage = 'library_review' THEN
    IF pending_library = 0 THEN
       -- Move to department_review (accounts)
       UPDATE clearance_requests SET current_stage = 'department_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  SELECT * INTO req FROM clearance_requests WHERE id = req.id;

  -- Phase 3: Accounts Review (department_review)
  IF req.current_stage = 'department_review' THEN
    IF pending_dues = 0 THEN
       UPDATE clearance_requests SET current_stage = 'hod_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. ATTACH TRIGGER TO library_dues
-- ============================================================
DROP TRIGGER IF EXISTS trg_evaluate_clearance_library ON library_dues;
CREATE TRIGGER trg_evaluate_clearance_library
AFTER UPDATE ON library_dues
FOR EACH ROW
EXECUTE FUNCTION evaluate_clearance_stage();
