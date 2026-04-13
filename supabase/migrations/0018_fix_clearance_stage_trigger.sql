-- 0018_fix_clearance_stage_trigger.sql
-- Fix the clearance evaluation trigger to use the new student_dues table

DROP TRIGGER IF EXISTS trg_evaluate_clearance ON department_clearance;

CREATE OR REPLACE FUNCTION evaluate_clearance_stage()
RETURNS TRIGGER AS $$
DECLARE
  req record;
  pending_faculty INT;
  rejected_faculty INT;
  pending_dues INT;
BEGIN
  -- Prevent evaluating if no request exists
  IF NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO req FROM clearance_requests WHERE student_id = NEW.student_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Evaluate faculty clearances
  SELECT COUNT(*) INTO pending_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id AND status != 'completed';
  
  SELECT COUNT(CASE WHEN status='rejected' THEN 1 END) INTO rejected_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id;

  -- Evaluate college dues (department_review phase)
  SELECT COUNT(*) INTO pending_dues
  FROM student_dues WHERE student_id = NEW.student_id AND status != 'completed';

  -- Phase 1: Faculty Review
  IF req.current_stage = 'faculty_review' THEN
    IF rejected_faculty > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Teacher flagged attendance shortfall' WHERE id = req.id;
    ELSIF pending_faculty = 0 THEN
       UPDATE clearance_requests SET current_stage = 'department_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  -- Refresh req record
  SELECT * INTO req FROM clearance_requests WHERE id = req.id;

  -- Phase 2: Department Review (Dues Phase)
  IF req.current_stage = 'department_review' THEN
    IF pending_dues = 0 THEN
       UPDATE clearance_requests SET current_stage = 'hod_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to student_dues
DROP TRIGGER IF EXISTS trg_evaluate_clearance_dues ON student_dues;
CREATE TRIGGER trg_evaluate_clearance_dues
AFTER UPDATE ON student_dues
FOR EACH ROW
EXECUTE FUNCTION evaluate_clearance_stage();

-- Ensure it's still attached to subject_enrollment
DROP TRIGGER IF EXISTS trg_evaluate_clearance ON subject_enrollment;
CREATE TRIGGER trg_evaluate_clearance
AFTER UPDATE ON subject_enrollment
FOR EACH ROW
EXECUTE FUNCTION evaluate_clearance_stage();

-- Retroactively push any students who qualify into the hod_review stage!
DO $$
DECLARE
  r record;
  pending_fac INT;
  pending_d INT;
BEGIN
  FOR r IN SELECT * FROM clearance_requests WHERE current_stage IN ('faculty_review', 'department_review') LOOP
    SELECT COUNT(*) INTO pending_fac FROM subject_enrollment WHERE student_id = r.student_id AND status != 'completed';
    SELECT COUNT(*) INTO pending_d FROM student_dues WHERE student_id = r.student_id AND status != 'completed';
    
    IF pending_fac = 0 THEN
       IF pending_d = 0 THEN
          UPDATE clearance_requests SET current_stage = 'hod_review', status = 'pending' WHERE id = r.id;
       ELSE
          UPDATE clearance_requests SET current_stage = 'department_review', status = 'pending' WHERE id = r.id;
       END IF;
    END IF;
  END LOOP;
END;
$$;
