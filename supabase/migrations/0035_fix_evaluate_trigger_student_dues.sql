-- 0035_fix_evaluate_trigger_student_dues.sql
-- Fixes a bug in evaluate_clearance_stage where it incorrectly referenced 'has_dues' on student_dues
-- instead of the correct 'status' column.

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

  -- Count college dues (Fixing the incorrect metric reference)
  SELECT COUNT(*) INTO pending_dues
  FROM student_dues WHERE student_id = NEW.student_id AND status = 'pending';

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
