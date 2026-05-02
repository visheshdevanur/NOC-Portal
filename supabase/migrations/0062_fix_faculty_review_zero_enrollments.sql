-- 0062_fix_faculty_review_zero_enrollments.sql
-- Fix: Students with NO subject_enrollment records were being auto-cleared
-- for faculty review because pending_faculty = 0 when there are no rows.
-- Now we also check that the student has at least one enrollment record
-- AND that all of them are 'completed' before advancing.

CREATE OR REPLACE FUNCTION evaluate_clearance_stage()
RETURNS TRIGGER AS $$
DECLARE
  req record;
  total_faculty INT;
  pending_faculty INT;
  rejected_faculty INT;
  pending_library INT;
  pending_dues INT;
BEGIN
  IF NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO req FROM clearance_requests WHERE student_id = NEW.student_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Count TOTAL enrollment records for this student
  SELECT COUNT(*) INTO total_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id;

  -- Count enrollments that are NOT yet completed
  SELECT COUNT(*) INTO pending_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id AND status != 'completed';
  
  SELECT COUNT(CASE WHEN status='rejected' THEN 1 END) INTO rejected_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id;

  -- Count library dues (permitted students don't block clearance)
  SELECT COUNT(*) INTO pending_library
  FROM library_dues WHERE student_id = NEW.student_id AND has_dues = TRUE AND permitted = FALSE;

  -- Count college dues (Excluding those with a valid permit)
  SELECT COUNT(*) INTO pending_dues
  FROM student_dues WHERE student_id = NEW.student_id AND status = 'pending' AND (permitted_until IS NULL OR permitted_until < NOW());

  -- Phase 1: Faculty Review
  -- Student must have at least 1 enrollment AND all must be 'completed'
  IF req.current_stage = 'faculty_review' THEN
    IF rejected_faculty > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Teacher flagged attendance shortfall' WHERE id = req.id;
    ELSIF total_faculty > 0 AND pending_faculty = 0 THEN
       UPDATE clearance_requests SET current_stage = 'library_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
    -- If total_faculty = 0, do nothing (student stays in faculty_review until teachers review them)
  END IF;

  SELECT * INTO req FROM clearance_requests WHERE id = req.id;

  -- Phase 2: Library Review (permitted = true bypasses this check)
  IF req.current_stage = 'library_review' THEN
    IF pending_library = 0 THEN
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
