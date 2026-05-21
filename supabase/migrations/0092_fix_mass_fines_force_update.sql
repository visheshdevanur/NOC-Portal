-- =============================================================
-- 0092: Fix mass fines to always update all matching students
-- When categories are edited, ALL students (including old ones)
-- should get the new fine amount applied
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

  -- Apply fines in a single UPDATE using a subquery join
  -- Force update ALL matching students regardless of current fine amount
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
    WHERE se.status = 'rejected'
      AND p.department_id = p_department_id
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
      -- Skip only already-verified (paid) fines
      AND NOT (se.attendance_fee > 0 AND se.attendance_fee_verified)
  )
  UPDATE subject_enrollment se2
  SET attendance_fee = e.new_fee,
      attendance_fee_verified = false
  FROM eligible e
  WHERE se2.id = e.enrollment_id;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- Count total eligible for reporting
  SELECT COUNT(*) INTO _total
  FROM subject_enrollment se
  JOIN profiles p ON se.student_id = p.id
  JOIN semesters s ON p.semester_id = s.id
  WHERE se.status = 'rejected'
    AND p.department_id = p_department_id
    AND p.tenant_id = _caller_tenant;

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
