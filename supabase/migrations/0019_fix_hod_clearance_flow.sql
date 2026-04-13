-- 0019_fix_hod_clearance_flow.sql
-- Fix: Students approved by faculty and accounts not appearing in HOD clearance section.
--
-- ROOT CAUSE: The evaluate_clearance_stage() trigger function was NOT declared as
-- SECURITY DEFINER, so when the 'accounts' user updated student_dues, the trigger
-- tried to UPDATE clearance_requests but was BLOCKED by RLS (accounts role was not
-- in the allowed update policy). The clearance_requests UPDATE policy only permits
-- faculty, staff, hod, admin — NOT accounts.
--
-- FIX 1: Make the trigger function SECURITY DEFINER so it runs as the DB owner
--         regardless of who triggers it (accounts, faculty, etc.)
-- FIX 2: Also add 'accounts' to the clearance_requests UPDATE RLS policy for safety.
-- FIX 3: Retroactively push any stuck students to the correct stage.

-- ============================================================
-- 1. Recreate the trigger function as SECURITY DEFINER
-- ============================================================
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

  -- Refresh req record after possible update
  SELECT * INTO req FROM clearance_requests WHERE id = req.id;

  -- Phase 2: Department Review (Dues Phase)
  IF req.current_stage = 'department_review' THEN
    IF pending_dues = 0 THEN
       UPDATE clearance_requests SET current_stage = 'hod_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Ensure triggers are attached (idempotent — safe if 0018 was already applied)
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

-- Drop old trigger names from 0002 if they still exist on subject_enrollment
DROP TRIGGER IF EXISTS trg_eval_faculty ON subject_enrollment;

-- ============================================================
-- 3. Add 'accounts' role to the clearance_requests UPDATE policy
-- ============================================================
-- Drop the old policy and recreate with 'accounts' included
DROP POLICY IF EXISTS "Faculty, Staff, HOD, Admin can update requests" ON clearance_requests;
CREATE POLICY "Faculty, Staff, HOD, Admin, Accounts can update requests" ON clearance_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty', 'staff', 'hod', 'admin', 'accounts'))
  );

-- ============================================================
-- 4. Retroactively fix any students stuck in wrong stages
-- ============================================================
DO $$
DECLARE
  r record;
  pending_fac INT;
  rejected_fac INT;
  pending_d INT;
BEGIN
  FOR r IN SELECT * FROM clearance_requests WHERE current_stage IN ('faculty_review', 'department_review') AND status = 'pending' LOOP
    -- Check faculty clearances
    SELECT COUNT(*) INTO pending_fac FROM subject_enrollment WHERE student_id = r.student_id AND status != 'completed';
    SELECT COUNT(CASE WHEN status='rejected' THEN 1 END) INTO rejected_fac FROM subject_enrollment WHERE student_id = r.student_id;
    
    -- Check dues
    SELECT COUNT(*) INTO pending_d FROM student_dues WHERE student_id = r.student_id AND status != 'completed';

    IF r.current_stage = 'faculty_review' THEN
      IF rejected_fac > 0 THEN
        UPDATE clearance_requests SET status = 'rejected', remarks = 'Teacher flagged attendance shortfall' WHERE id = r.id;
      ELSIF pending_fac = 0 THEN
        -- Faculty done, check if dues also done
        IF pending_d = 0 THEN
          UPDATE clearance_requests SET current_stage = 'hod_review', status = 'pending', remarks = NULL WHERE id = r.id;
        ELSE
          UPDATE clearance_requests SET current_stage = 'department_review', status = 'pending', remarks = NULL WHERE id = r.id;
        END IF;
      END IF;
    ELSIF r.current_stage = 'department_review' THEN
      IF pending_d = 0 THEN
        UPDATE clearance_requests SET current_stage = 'hod_review', status = 'pending', remarks = NULL WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
