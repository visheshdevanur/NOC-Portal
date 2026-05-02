-- 0065_clearance_demotion_and_auto_fines.sql
-- 
-- FIX 1: Demotion logic in evaluate_clearance_stage()
--   If a faculty rejects a student AFTER the student was already advanced
--   beyond faculty_review (or even cleared), demote them back.
--   Same logic for library and accounts stages.
--
-- FIX 2: Auto-apply attendance fines
--   When a teacher rejects an enrollment (status='rejected'), automatically
--   look up the matching fine category and set attendance_fee on that enrollment.

-- ============================================================
-- 1. ENHANCED evaluate_clearance_stage() with DEMOTION LOGIC
-- ============================================================
CREATE OR REPLACE FUNCTION evaluate_clearance_stage()
RETURNS TRIGGER AS $$
DECLARE
  req record;
  total_faculty INT;
  pending_faculty INT;
  rejected_faculty INT;
  pending_library INT;
  pending_dues INT;
  stage_order INT;
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

  -- Count unpaid attendance fines (rejected with fee > 0 and not verified)
  -- This is handled by pending_faculty already since rejected enrollments are not 'completed'

  -- Count library dues (permitted students don't block clearance)
  SELECT COUNT(*) INTO pending_library
  FROM library_dues WHERE student_id = NEW.student_id AND has_dues = TRUE AND permitted = FALSE;

  -- Count college dues (Excluding those with a valid permit)
  SELECT COUNT(*) INTO pending_dues
  FROM student_dues WHERE student_id = NEW.student_id AND status = 'pending' AND (permitted_until IS NULL OR permitted_until < NOW());

  -- =======================================================
  -- DEMOTION: If faculty has rejected enrollments and student
  -- is BEYOND faculty_review, demote them back
  -- =======================================================
  IF (rejected_faculty > 0 OR (total_faculty > 0 AND pending_faculty > 0)) THEN
    IF req.current_stage IN ('library_review', 'department_review', 'hod_review', 'cleared') THEN
      UPDATE clearance_requests 
      SET current_stage = 'faculty_review', 
          status = (CASE WHEN rejected_faculty > 0 THEN 'rejected' ELSE 'pending' END)::clearance_status, 
          remarks = CASE WHEN rejected_faculty > 0 THEN 'Teacher flagged attendance shortfall' ELSE NULL END,
          updated_at = NOW()
      WHERE id = req.id;
      RETURN NEW;  -- Stop here, student needs to fix faculty issues first
    END IF;
  END IF;

  -- DEMOTION: If library dues appeared and student is beyond library_review
  IF pending_library > 0 THEN
    IF req.current_stage IN ('department_review', 'hod_review', 'cleared') THEN
      UPDATE clearance_requests 
      SET current_stage = 'library_review', 
          status = 'pending', 
          remarks = 'Library dues detected',
          updated_at = NOW()
      WHERE id = req.id;
      RETURN NEW;
    END IF;
  END IF;

  -- DEMOTION: If accounts dues appeared and student is beyond department_review
  IF pending_dues > 0 THEN
    IF req.current_stage IN ('hod_review', 'cleared') THEN
      UPDATE clearance_requests 
      SET current_stage = 'department_review', 
          status = 'pending', 
          remarks = 'Accounts dues detected',
          updated_at = NOW()
      WHERE id = req.id;
      RETURN NEW;
    END IF;
  END IF;

  -- =======================================================
  -- FORWARD PROGRESSION (existing logic)
  -- =======================================================

  -- Re-fetch after possible demotion
  SELECT * INTO req FROM clearance_requests WHERE id = req.id;

  -- Phase 1: Faculty Review
  -- Student must have at least 1 enrollment AND all must be 'completed'
  IF req.current_stage = 'faculty_review' THEN
    IF rejected_faculty > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Teacher flagged attendance shortfall' WHERE id = req.id;
    ELSIF total_faculty > 0 AND pending_faculty = 0 THEN
       UPDATE clearance_requests SET current_stage = 'library_review', status = 'pending', remarks = NULL WHERE id = req.id;
    END IF;
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


-- ============================================================
-- 2. AUTO-APPLY ATTENDANCE FINES TRIGGER
--    When a teacher updates an enrollment to 'rejected', 
--    automatically look up the fine category and set the fee.
-- ============================================================
CREATE OR REPLACE FUNCTION auto_apply_attendance_fine()
RETURNS TRIGGER AS $$
DECLARE
  student_dept_id UUID;
  matched_fine NUMERIC;
  pct INT;
BEGIN
  -- Only run when status is 'rejected' and it either just changed, or attendance_pct changed
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected' OR NEW.attendance_pct IS DISTINCT FROM OLD.attendance_pct) THEN
    pct := COALESCE(NEW.attendance_pct, 0);
    
    -- Get the student's department_id
    SELECT department_id INTO student_dept_id
    FROM profiles WHERE id = NEW.student_id;
    
    IF student_dept_id IS NOT NULL THEN
      -- Find matching category
      SELECT fine_amount INTO matched_fine
      FROM attendance_fine_categories
      WHERE department_id = student_dept_id
        AND pct >= min_pct
        AND pct <= max_pct
      LIMIT 1;
      
      IF matched_fine IS NOT NULL AND matched_fine > 0 THEN
        NEW.attendance_fee := matched_fine;
        NEW.attendance_fee_verified := FALSE;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the trigger BEFORE UPDATE so we can modify NEW
DROP TRIGGER IF EXISTS trg_auto_apply_attendance_fine ON subject_enrollment;
CREATE TRIGGER trg_auto_apply_attendance_fine
BEFORE UPDATE ON subject_enrollment
FOR EACH ROW
EXECUTE FUNCTION auto_apply_attendance_fine();

-- Also on INSERT (when enrollment is created with status='rejected')
DROP TRIGGER IF EXISTS trg_auto_apply_attendance_fine_insert ON subject_enrollment;
CREATE TRIGGER trg_auto_apply_attendance_fine_insert
BEFORE INSERT ON subject_enrollment
FOR EACH ROW
EXECUTE FUNCTION auto_apply_attendance_fine();


-- ============================================================
-- 3. RE-APPLY FINES WHEN CATEGORIES CHANGE
--    When a category is created/updated, retroactively update
--    all rejected enrollments in that department that match.
-- ============================================================
CREATE OR REPLACE FUNCTION reapply_category_fines()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all rejected enrollments in this department that fall in the new range
  -- and don't already have a verified (paid) fine
  UPDATE subject_enrollment se
  SET attendance_fee = NEW.fine_amount,
      attendance_fee_verified = FALSE
  FROM profiles p
  WHERE se.student_id = p.id
    AND p.department_id = NEW.department_id
    AND se.status = 'rejected'
    AND COALESCE(se.attendance_fee_verified, FALSE) = FALSE
    AND COALESCE(se.attendance_pct, 0) >= NEW.min_pct
    AND COALESCE(se.attendance_pct, 0) <= NEW.max_pct;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reapply_category_fines ON attendance_fine_categories;
CREATE TRIGGER trg_reapply_category_fines
AFTER INSERT OR UPDATE ON attendance_fine_categories
FOR EACH ROW
EXECUTE FUNCTION reapply_category_fines();


-- ============================================================
-- 4. RETROACTIVE FIX: Demote any students currently at a 
--    cleared/hod_review stage who have pending rejections
-- ============================================================
DO $$
DECLARE
  r record;
  rej_count INT;
  pend_lib INT;
  pend_dues INT;
BEGIN
  FOR r IN SELECT * FROM clearance_requests WHERE current_stage IN ('hod_review', 'cleared', 'library_review', 'department_review') LOOP
    SELECT COUNT(*) INTO rej_count FROM subject_enrollment WHERE student_id = r.student_id AND status = 'rejected';
    SELECT COUNT(*) INTO pend_lib FROM library_dues WHERE student_id = r.student_id AND has_dues = TRUE AND permitted = FALSE;
    SELECT COUNT(*) INTO pend_dues FROM student_dues WHERE student_id = r.student_id AND status = 'pending' AND (permitted_until IS NULL OR permitted_until < NOW());
    
    IF rej_count > 0 AND r.current_stage IN ('library_review', 'department_review', 'hod_review', 'cleared') THEN
      UPDATE clearance_requests SET current_stage = 'faculty_review', status = 'rejected', remarks = 'Teacher flagged attendance shortfall', updated_at = NOW() WHERE id = r.id;
    ELSIF pend_lib > 0 AND r.current_stage IN ('department_review', 'hod_review', 'cleared') THEN
      UPDATE clearance_requests SET current_stage = 'library_review', status = 'pending', remarks = 'Library dues detected', updated_at = NOW() WHERE id = r.id;
    ELSIF pend_dues > 0 AND r.current_stage IN ('hod_review', 'cleared') THEN
      UPDATE clearance_requests SET current_stage = 'department_review', status = 'pending', remarks = 'Accounts dues detected', updated_at = NOW() WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;


-- ============================================================
-- 5. RETROACTIVE: Auto-apply fines to existing rejected 
--    enrollments that don't have a fee set yet
-- ============================================================
DO $$
DECLARE
  enr record;
  matched_fine NUMERIC;
  student_dept UUID;
BEGIN
  FOR enr IN SELECT se.id, se.student_id, se.attendance_pct, se.attendance_fee, se.attendance_fee_verified
             FROM subject_enrollment se
             WHERE se.status = 'rejected'
               AND (se.attendance_fee IS NULL OR se.attendance_fee = 0)
               AND COALESCE(se.attendance_fee_verified, FALSE) = FALSE
  LOOP
    SELECT department_id INTO student_dept FROM profiles WHERE id = enr.student_id;
    IF student_dept IS NOT NULL THEN
      SELECT fine_amount INTO matched_fine
      FROM attendance_fine_categories
      WHERE department_id = student_dept
        AND COALESCE(enr.attendance_pct, 0) >= min_pct
        AND COALESCE(enr.attendance_pct, 0) <= max_pct
      LIMIT 1;
      
      IF matched_fine IS NOT NULL AND matched_fine > 0 THEN
        UPDATE subject_enrollment SET attendance_fee = matched_fine, attendance_fee_verified = FALSE WHERE id = enr.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
