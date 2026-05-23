-- =============================================================
-- 0098: Fix category edit → live update student fines
--
-- Problem: When HOD/FYC edits attendance fine categories,
-- rpc_apply_mass_fines only updated students with status='rejected'.
-- Students with status='pending' or 'completed' (but low attendance)
-- were skipped, so their fines didn't update live.
--
-- Fix: Target ALL students with attendance below category thresholds,
-- regardless of enrollment status. Only skip already-paid fines.
-- =============================================================

CREATE OR REPLACE FUNCTION rpc_apply_mass_fines(
  p_department_id UUID,
  p_is_first_year BOOLEAN
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _updated INT := 0;
  _skipped INT := 0;
  _total INT := 0;
BEGIN
  -- Tenant isolation
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  -- Apply fines: match ALL students against categories
  -- Skip only already-paid (fee_verified = true) fines
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
      -- Only update if attendance_pct is NOT null (faculty has entered it)
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
    AND (se2.attendance_fee IS DISTINCT FROM e.new_fee);  -- Only update if fee actually changed

  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- Count total eligible for reporting
  SELECT COUNT(*) INTO _total
  FROM subject_enrollment se
  JOIN profiles p ON se.student_id = p.id
  JOIN semesters s ON p.semester_id = s.id
  WHERE p.department_id = p_department_id
    AND p.tenant_id = _caller_tenant
    AND se.attendance_pct IS NOT NULL;

  _skipped := _total - _updated;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'Applied Mass Fines (RPC)',
    format('Updated: %s, Skipped: %s, Total: %s', _updated, _skipped, _total),
    _caller_tenant
  );

  RETURN json_build_object('updated', _updated, 'skipped', _skipped, 'total', _total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
