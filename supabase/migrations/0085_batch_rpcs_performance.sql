-- =============================================================
-- 0085: PERFORMANCE — Batch RPCs to eliminate N+1 client queries
-- =============================================================
-- Replaces client-side loops that make 1 query per row with
-- server-side batch operations in single transactions.
-- At 50K users these loops would take 30-60 minutes; the RPCs
-- complete in seconds.
-- =============================================================


-- =============================================================
-- 1. rpc_apply_mass_fines — replaces per-enrollment UPDATE loop
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
  WITH eligible AS (
    SELECT se.id AS enrollment_id, se.attendance_pct, se.attendance_fee, se.attendance_fee_verified,
           afc.fine_amount AS new_fee
    FROM subject_enrollment se
    JOIN profiles p ON se.student_id = p.id
    JOIN semesters s ON p.semester_id = s.id
    JOIN attendance_fine_categories afc ON afc.department_id = p_department_id
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
      -- Skip already-verified or same-amount fines
      AND NOT (se.attendance_fee > 0 AND se.attendance_fee_verified)
      AND (se.attendance_fee IS DISTINCT FROM afc.fine_amount)
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


-- =============================================================
-- 2. rpc_bulk_assign_sections — replaces per-student UPDATE loop
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_bulk_assign_sections(
  p_assignments JSONB
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _updated INT := 0;
  _row JSONB;
  _student_id UUID;
BEGIN
  -- Tenant isolation
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  FOR _row IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    _student_id := (_row->>'student_id')::UUID;

    -- Verify student belongs to caller's tenant
    UPDATE profiles
    SET section = UPPER(_row->>'section'),
        updated_at = now()
    WHERE id = _student_id
      AND tenant_id = _caller_tenant
      AND role = 'student';

    IF FOUND THEN
      _updated := _updated + 1;
    END IF;
  END LOOP;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'Bulk Assigned Sections (RPC)',
    format('Assigned sections to %s students', _updated),
    _caller_tenant
  );

  RETURN json_build_object('updated', _updated);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =============================================================
-- 3. rpc_bulk_assign_sections_csv — replaces per-row CSV loop
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_bulk_assign_sections_csv(
  p_department_id UUID,
  p_rows JSONB
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _updated INT := 0;
  _errors TEXT[] := '{}';
  _row JSONB;
  _student_id UUID;
BEGIN
  -- Tenant isolation
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  FOR _row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    -- Find student by roll number in the caller's tenant
    SELECT id INTO _student_id
    FROM profiles
    WHERE UPPER(roll_number) = UPPER(_row->>'roll_number')
      AND department_id = p_department_id
      AND tenant_id = _caller_tenant
      AND role = 'student'
    LIMIT 1;

    IF _student_id IS NULL THEN
      _errors := array_append(_errors, 'USN "' || (_row->>'roll_number') || '" not found');
      CONTINUE;
    END IF;

    UPDATE profiles
    SET section = UPPER(TRIM(_row->>'section')),
        updated_at = now()
    WHERE id = _student_id;

    _updated := _updated + 1;
  END LOOP;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'CSV Section Assignment (RPC)',
    format('Assigned %s/%s students', _updated, jsonb_array_length(p_rows)),
    _caller_tenant
  );

  RETURN json_build_object('updated', _updated, 'errors', to_jsonb(_errors));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
