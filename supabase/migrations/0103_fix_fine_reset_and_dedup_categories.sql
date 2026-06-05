-- =============================================================
-- 0103: Fix fine not resetting when attendance drops below all categories
--
-- Bug: When faculty changes attendance from 70% to 30%, and 30% is
-- below the lowest fine category (e.g., 55-64%), the fine from 70%
-- persists because the trigger only sets a fine when a category matches
-- but never clears it when NO category matches.
--
-- Fix: Add ELSE clause to reset attendance_fee to 0 when no matching
-- category is found (and fine hasn't been paid yet).
--
-- Also: Add unique constraint on attendance_fine_categories to prevent
-- duplicate rows that cause UI duplication in HOD dashboards.
-- =============================================================

-- ============================================================
-- 1. FIX auto_apply_attendance_fine() — reset fee when no match
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
      
      -- Reset matched_fine
      matched_fine := NULL;
      
      -- Find matching category based on is_first_year flag
      SELECT fine_amount INTO matched_fine
      FROM attendance_fine_categories
      WHERE department_id = student_dept_id
        AND is_first_year = is_first_yr
        AND pct >= min_pct
        AND pct <= max_pct
      LIMIT 1;
      
      IF matched_fine IS NOT NULL AND matched_fine > 0 THEN
        -- Category found: apply the fine
        NEW.attendance_fee := matched_fine;
        NEW.attendance_fee_verified := FALSE;
      ELSE
        -- NO category matches this attendance % (e.g., 30% with lowest slab at 55%)
        -- Reset the fine to 0 ONLY if it hasn't been paid yet
        IF COALESCE(NEW.attendance_fee_verified, FALSE) = FALSE THEN
          NEW.attendance_fee := 0;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. FIX rpc_apply_mass_fines — also clear fines for students
--    whose attendance falls OUTSIDE all category ranges
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_apply_mass_fines(
  p_department_id UUID,
  p_is_first_year BOOLEAN
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _updated INT := 0;
  _cleared INT := 0;
  _skipped INT := 0;
  _total INT := 0;
BEGIN
  -- Tenant isolation
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  -- Step 1: Apply fines to students whose attendance matches a category
  WITH eligible AS (
    SELECT se.id AS enrollment_id, se.attendance_pct, se.attendance_fee, se.attendance_fee_verified,
           afc.fine_amount AS new_fee
    FROM subject_enrollment se
    JOIN profiles p ON se.student_id = p.id
    JOIN semesters s ON p.semester_id = s.id
    JOIN attendance_fine_categories afc ON afc.department_id = p_department_id
      AND afc.is_first_year = p_is_first_year
      AND se.attendance_pct >= afc.min_pct
      AND se.attendance_pct <= afc.max_pct
    WHERE p.department_id = p_department_id
      AND p.tenant_id = _caller_tenant
      AND (
        (p_is_first_year AND (
          LOWER(s.name) LIKE '%1st%' OR LOWER(s.name) LIKE '%2nd%'
          OR LOWER(s.name) LIKE '%first%' OR LOWER(s.name) LIKE '%second%'
          OR s.name = '1' OR s.name = '2'
        ))
        OR
        (NOT p_is_first_year AND NOT (
          LOWER(s.name) LIKE '%1st%' OR LOWER(s.name) LIKE '%2nd%'
          OR LOWER(s.name) LIKE '%first%' OR LOWER(s.name) LIKE '%second%'
          OR s.name = '1' OR s.name = '2'
        ))
      )
      -- Skip already-paid fines
      AND (se.attendance_fee_verified IS NOT TRUE)
      -- Only update if attendance_pct is NOT null
      AND se.attendance_pct IS NOT NULL
  )
  UPDATE subject_enrollment se2
  SET attendance_fee = e.new_fee,
      attendance_fee_verified = false,
      status = CASE
        WHEN e.new_fee > 0 AND se2.status != 'completed' THEN 'rejected'
        ELSE se2.status
      END
  FROM eligible e
  WHERE se2.id = e.enrollment_id
    AND (se2.attendance_fee IS DISTINCT FROM e.new_fee);

  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- Step 2: Clear fines for students whose attendance does NOT match ANY category
  -- (e.g., 30% when lowest category starts at 55%)
  -- Only clear if not already paid
  WITH no_match AS (
    SELECT se.id AS enrollment_id
    FROM subject_enrollment se
    JOIN profiles p ON se.student_id = p.id
    JOIN semesters s ON p.semester_id = s.id
    WHERE p.department_id = p_department_id
      AND p.tenant_id = _caller_tenant
      AND (
        (p_is_first_year AND (
          LOWER(s.name) LIKE '%1st%' OR LOWER(s.name) LIKE '%2nd%'
          OR LOWER(s.name) LIKE '%first%' OR LOWER(s.name) LIKE '%second%'
          OR s.name = '1' OR s.name = '2'
        ))
        OR
        (NOT p_is_first_year AND NOT (
          LOWER(s.name) LIKE '%1st%' OR LOWER(s.name) LIKE '%2nd%'
          OR LOWER(s.name) LIKE '%first%' OR LOWER(s.name) LIKE '%second%'
          OR s.name = '1' OR s.name = '2'
        ))
      )
      AND (se.attendance_fee_verified IS NOT TRUE)
      AND se.attendance_pct IS NOT NULL
      AND se.attendance_fee > 0
      -- This enrollment does NOT match any category
      AND NOT EXISTS (
        SELECT 1 FROM attendance_fine_categories afc
        WHERE afc.department_id = p_department_id
          AND afc.is_first_year = p_is_first_year
          AND se.attendance_pct >= afc.min_pct
          AND se.attendance_pct <= afc.max_pct
      )
  )
  UPDATE subject_enrollment se2
  SET attendance_fee = 0,
      attendance_fee_verified = false
  FROM no_match nm
  WHERE se2.id = nm.enrollment_id;

  GET DIAGNOSTICS _cleared = ROW_COUNT;

  -- Count total eligible for reporting
  SELECT COUNT(*) INTO _total
  FROM subject_enrollment se
  JOIN profiles p ON se.student_id = p.id
  JOIN semesters s ON p.semester_id = s.id
  WHERE p.department_id = p_department_id
    AND p.tenant_id = _caller_tenant
    AND se.attendance_pct IS NOT NULL;

  _skipped := _total - _updated - _cleared;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'Applied Mass Fines (RPC)',
    format('Updated: %s, Cleared: %s, Skipped: %s, Total: %s', _updated, _cleared, _skipped, _total),
    _caller_tenant
  );

  RETURN json_build_object('updated', _updated, 'cleared', _cleared, 'skipped', _skipped, 'total', _total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 3. DEDUPLICATE existing attendance_fine_categories
--    Keep only one row per (department_id, is_first_year, min_pct, max_pct)
-- ============================================================
DELETE FROM attendance_fine_categories
WHERE id NOT IN (
  SELECT DISTINCT ON (department_id, is_first_year, min_pct, max_pct) id
  FROM attendance_fine_categories
  ORDER BY department_id, is_first_year, min_pct, max_pct, created_at ASC
);


-- ============================================================
-- 4. ADD unique constraint to prevent future duplicates
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_fine_category_dept_year_range'
  ) THEN
    ALTER TABLE attendance_fine_categories
    ADD CONSTRAINT uq_fine_category_dept_year_range
    UNIQUE (department_id, is_first_year, min_pct, max_pct);
  END IF;
END;
$$;


-- ============================================================
-- 5. RETROACTIVE: Fix existing students with stale fines
--    Reset fines for students whose attendance doesn't match any category
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
               AND se.attendance_fee > 0
               AND COALESCE(se.attendance_fee_verified, FALSE) = FALSE
  LOOP
    SELECT department_id, semester_id INTO student_dept, student_sem FROM profiles WHERE id = enr.student_id;
    IF student_dept IS NOT NULL AND student_sem IS NOT NULL THEN
      SELECT name INTO sem_n FROM semesters WHERE id = student_sem;
      is_first_yr := (sem_n = '1' OR sem_n = '2');
      
      matched_fine := NULL;
      
      SELECT fine_amount INTO matched_fine
      FROM attendance_fine_categories
      WHERE department_id = student_dept
        AND is_first_year = is_first_yr
        AND COALESCE(enr.attendance_pct, 0) >= min_pct
        AND COALESCE(enr.attendance_pct, 0) <= max_pct
      LIMIT 1;
      
      -- If no category matches, reset the fine to 0
      IF matched_fine IS NULL THEN
        UPDATE subject_enrollment 
        SET attendance_fee = 0
        WHERE id = enr.id;
      ELSIF matched_fine != enr.attendance_fee THEN
        -- If category matches but fine is wrong (stale), update it
        UPDATE subject_enrollment 
        SET attendance_fee = matched_fine
        WHERE id = enr.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
