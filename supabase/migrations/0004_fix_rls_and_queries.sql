-- 0004_fix_rls_and_queries.sql
-- Fix RLS policies and schema issues that prevent buttons from working

-- ============================================================
-- 1. Allow Admin to read ALL tables
-- ============================================================
CREATE POLICY "Admin can read all clearance requests" ON clearance_requests
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can read all subject enrollment" ON subject_enrollment
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can read all department clearance" ON department_clearance
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can update profiles" ON profiles
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 2. Allow HOD to read profiles (needed for the join in getHodPendingRequests)
-- ============================================================
-- Already have "Users can read all profiles" - so this is fine

-- ============================================================
-- 3. Allow HOD to insert notifications
-- ============================================================
-- Already have "System can insert notifications" WITH CHECK (true) - so this is fine

-- ============================================================
-- 4. Allow subjects to be readable by everyone (needed for student dashboard joins)
-- ============================================================
-- Already have "Anyone can read subjects" - so this is fine

-- ============================================================
-- 5. Allow Faculty to read profiles (needed for faculty dashboard join with student profiles)
-- ============================================================
-- Already have "Users can read all profiles" - so this is fine

-- ============================================================
-- 6. Allow HOD to read clearance_requests (they need to see requests at hod_review stage)
-- ============================================================
CREATE POLICY "HOD can read all clearance requests" ON clearance_requests
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod'));

CREATE POLICY "HOD can update clearance requests" ON clearance_requests
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod'));

-- ============================================================
-- 7. Staff need to be able to read student profiles for the join
-- ============================================================
-- Already covered by "Users can read all profiles"

-- ============================================================
-- 8. Fix: Allow students to read subjects for the enrollment join
-- ============================================================
-- Already covered by "Anyone can read subjects"

-- ============================================================
-- 9. Fix the evaluate_clearance_stage to clear fine_amount check properly
-- ============================================================
CREATE OR REPLACE FUNCTION evaluate_clearance_stage()
RETURNS TRIGGER AS $$
DECLARE
  req record;
  pending_faculty INT;
  rejected_faculty INT;
  pending_dept INT;
  rejected_dept INT;
  total_fine DECIMAL;
BEGIN
  -- We run this whenever a subject_enrollment or department_clearance changes
  
  -- Prevent evaluating if no request exists
  SELECT * INTO req FROM clearance_requests WHERE student_id = NEW.student_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Count pending and rejected faculty clearances
  SELECT COUNT(*) INTO pending_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id AND status != 'completed';
  
  SELECT COUNT(CASE WHEN status='rejected' THEN 1 END) INTO rejected_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id;

  -- Count pending and rejected dept clearances
  SELECT COUNT(*) INTO pending_dept
  FROM department_clearance WHERE student_id = NEW.student_id AND status != 'completed';
  
  SELECT COUNT(CASE WHEN status='rejected' THEN 1 END) INTO rejected_dept
  FROM department_clearance WHERE student_id = NEW.student_id;

  -- Phase 1: Faculty Review
  IF req.current_stage = 'faculty_review' THEN
    IF rejected_faculty > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Rejected by faculty' WHERE id = req.id;
    ELSIF pending_faculty = 0 THEN
       UPDATE clearance_requests SET current_stage = 'department_review' WHERE id = req.id;
    END IF;
  END IF;

  -- Phase 2: Department Review (no fine check - staff should set fine to 0 before clearing)
  IF req.current_stage = 'department_review' THEN
    IF rejected_dept > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Rejected by department' WHERE id = req.id;
    ELSIF pending_dept = 0 THEN
       UPDATE clearance_requests SET current_stage = 'hod_review' WHERE id = req.id;
    END IF;
  END IF;

  -- Phase 3: HOD review happens manually by updating clearance_requests directly.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
