-- 0070_attendance_fine_triggers_fix.sql
-- Fixes attendance fine triggers to correctly use the is_first_year flag
-- so that Sem 1 & 2 students get FYC fines and Sem 3-8 get HOD fines.

-- ============================================================
-- 1. UPDATE auto_apply_attendance_fine TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION auto_apply_attendance_fine()
RETURNS TRIGGER AS $$
DECLARE
  student_dept_id UUID;
  student_sem_id UUID;
  sem_name TEXT;
  is_first_yr BOOLEAN;
  matched_fine NUMERIC;
  pct INT;
BEGIN
  -- Only run when status is 'rejected' and it either just changed, or attendance_pct changed
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected' OR NEW.attendance_pct IS DISTINCT FROM OLD.attendance_pct) THEN
    pct := COALESCE(NEW.attendance_pct, 0);
    
    -- Get the student's department_id and semester_id
    SELECT department_id, semester_id INTO student_dept_id, student_sem_id
    FROM profiles WHERE id = NEW.student_id;
    
    IF student_dept_id IS NOT NULL AND student_sem_id IS NOT NULL THEN
      -- Get semester name to check if first year
      SELECT name INTO sem_name FROM semesters WHERE id = student_sem_id;
      is_first_yr := (sem_name = '1' OR sem_name = '2');
      
      -- Find matching category based on is_first_year flag
      SELECT fine_amount INTO matched_fine
      FROM attendance_fine_categories
      WHERE department_id = student_dept_id
        AND is_first_year = is_first_yr
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


-- ============================================================
-- 2. UPDATE reapply_category_fines TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION reapply_category_fines()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all rejected enrollments in this department that fall in the new range
  -- and don't already have a verified (paid) fine
  -- ONLY update students whose semester matches the is_first_year flag
  UPDATE subject_enrollment se
  SET attendance_fee = NEW.fine_amount,
      attendance_fee_verified = FALSE
  FROM profiles p
  JOIN semesters s ON p.semester_id = s.id
  WHERE se.student_id = p.id
    AND p.department_id = NEW.department_id
    AND ((NEW.is_first_year = TRUE AND (s.name = '1' OR s.name = '2'))
         OR (NEW.is_first_year = FALSE AND s.name NOT IN ('1', '2')))
    AND se.status = 'rejected'
    AND COALESCE(se.attendance_fee_verified, FALSE) = FALSE
    AND COALESCE(se.attendance_pct, 0) >= NEW.min_pct
    AND COALESCE(se.attendance_pct, 0) <= NEW.max_pct;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 3. RETROACTIVE: Auto-apply fines to existing rejected enrollments
-- ============================================================
DO $$
DECLARE
  enr record;
  matched_fine NUMERIC;
  student_dept UUID;
  student_sem UUID;
  sem_n TEXT;
  is_first_yr BOOLEAN;
BEGIN
  FOR enr IN SELECT se.id, se.student_id, se.attendance_pct, se.attendance_fee, se.attendance_fee_verified
             FROM subject_enrollment se
             WHERE se.status = 'rejected'
               AND COALESCE(se.attendance_fee_verified, FALSE) = FALSE
  LOOP
    SELECT department_id, semester_id INTO student_dept, student_sem FROM profiles WHERE id = enr.student_id;
    IF student_dept IS NOT NULL AND student_sem IS NOT NULL THEN
      SELECT name INTO sem_n FROM semesters WHERE id = student_sem;
      is_first_yr := (sem_n = '1' OR sem_n = '2');
      
      -- Reset fine lookup
      matched_fine := NULL;
      
      SELECT fine_amount INTO matched_fine
      FROM attendance_fine_categories
      WHERE department_id = student_dept
        AND is_first_year = is_first_yr
        AND COALESCE(enr.attendance_pct, 0) >= min_pct
        AND COALESCE(enr.attendance_pct, 0) <= max_pct
      LIMIT 1;
      
      -- Update fee if a matching category is found, otherwise 0
      UPDATE subject_enrollment 
      SET attendance_fee = COALESCE(matched_fine, 0),
          attendance_fee_verified = FALSE 
      WHERE id = enr.id;
    END IF;
  END LOOP;
END;
$$;
