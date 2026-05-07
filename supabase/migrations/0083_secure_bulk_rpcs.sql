-- =============================================================
-- 0083: SECURITY — Add tenant isolation to all SECURITY DEFINER RPCs
-- =============================================================
-- Phase 0 created bulk RPCs (0077, 0078) that run as SECURITY DEFINER
-- (bypassing RLS) but did NOT validate the caller's tenant_id.
-- An admin from Tenant A could call these RPCs with Tenant B's IDs
-- and silently modify their data.
--
-- This migration rewrites each RPC to:
-- 1. Resolve the caller's tenant_id from their profile
-- 2. Verify ALL target rows belong to that tenant
-- 3. RAISE EXCEPTION on any cross-tenant access attempt
-- 4. Log the operation for audit trail
-- =============================================================


-- =============================================================
-- 1. bulk_process_college_dues — tenant-scoped
-- =============================================================
CREATE OR REPLACE FUNCTION bulk_process_college_dues(
  p_pending_ids UUID[],
  p_pending_amounts NUMERIC[],
  p_all_ids UUID[]
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _no_dues_ids UUID[];
  _i INT;
  _updated_pending INT := 0;
  _updated_cleared INT := 0;
  _cross_tenant INT;
BEGIN
  -- Get caller's tenant
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  -- Verify ALL target IDs belong to caller's tenant
  SELECT COUNT(*) INTO _cross_tenant
  FROM student_dues sd
  JOIN profiles p ON sd.student_id = p.id
  WHERE sd.id = ANY(p_all_ids)
    AND p.tenant_id IS DISTINCT FROM _caller_tenant;

  IF _cross_tenant > 0 THEN
    RAISE EXCEPTION 'Cross-tenant operation denied: % dues belong to another tenant', _cross_tenant;
  END IF;

  -- Calculate IDs that are NOT pending (should be marked completed)
  _no_dues_ids := ARRAY(
    SELECT unnest(p_all_ids)
    EXCEPT
    SELECT unnest(p_pending_ids)
  );

  -- Mark non-pending dues as completed
  UPDATE student_dues
  SET status = 'completed', updated_at = now()
  WHERE id = ANY(_no_dues_ids);

  GET DIAGNOSTICS _updated_cleared = ROW_COUNT;

  -- Update pending dues with their amounts
  IF p_pending_ids IS NOT NULL AND array_length(p_pending_ids, 1) > 0 THEN
    FOR _i IN 1..array_length(p_pending_ids, 1) LOOP
      UPDATE student_dues
      SET status = 'pending',
          fine_amount = p_pending_amounts[_i],
          updated_at = now()
      WHERE id = p_pending_ids[_i];

      _updated_pending := _updated_pending + 1;
    END LOOP;
  END IF;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'Bulk College Dues Processed',
    format('Pending: %s updated, Cleared: %s updated', _updated_pending, _updated_cleared),
    _caller_tenant
  );

  RETURN json_build_object(
    'pending_updated', _updated_pending,
    'cleared_updated', _updated_cleared
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================
-- 2. bulk_process_library_dues — tenant-scoped
-- =============================================================
CREATE OR REPLACE FUNCTION bulk_process_library_dues(
  p_not_paid_rolls TEXT[]
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _not_paid_count INT;
  _cleared_count INT;
  _upper_rolls TEXT[];
BEGIN
  -- Get caller's tenant
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  -- Normalize to uppercase
  _upper_rolls := ARRAY(SELECT UPPER(UNNEST(p_not_paid_rolls)));

  -- Mark students in the list as having dues — SCOPED TO CALLER'S TENANT
  UPDATE library_dues ld
  SET has_dues = true,
      permitted = false,
      remarks = 'Not paid — bulk upload',
      updated_at = now()
  FROM profiles p
  WHERE ld.student_id = p.id
    AND UPPER(p.roll_number) = ANY(_upper_rolls)
    AND p.tenant_id = _caller_tenant;

  GET DIAGNOSTICS _not_paid_count = ROW_COUNT;

  -- Auto-clear everyone else — SCOPED TO CALLER'S TENANT
  UPDATE library_dues ld
  SET has_dues = false,
      permitted = false,
      fine_amount = 0,
      remarks = 'Cleared — not in upload list',
      updated_at = now()
  FROM profiles p
  WHERE ld.student_id = p.id
    AND (p.roll_number IS NULL OR UPPER(p.roll_number) != ALL(_upper_rolls))
    AND p.tenant_id = _caller_tenant;

  GET DIAGNOSTICS _cleared_count = ROW_COUNT;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'Bulk Library Dues Processed',
    format('Not paid: %s, Cleared: %s', _not_paid_count, _cleared_count),
    _caller_tenant
  );

  RETURN json_build_object(
    'not_paid', _not_paid_count,
    'cleared', _cleared_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================
-- 3. bulk_set_attendance_dues — tenant-scoped
-- =============================================================
CREATE OR REPLACE FUNCTION bulk_set_attendance_dues(
  p_department_id UUID,
  p_rows JSONB
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _dept_tenant UUID;
  _row JSONB;
  _student_id UUID;
  _subject_id UUID;
  _amount NUMERIC;
  _updated INT := 0;
  _errors TEXT[] := '{}';
BEGIN
  -- Get caller's tenant
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  -- Verify the department belongs to the caller's tenant
  SELECT tenant_id INTO _dept_tenant FROM departments WHERE id = p_department_id;
  IF _dept_tenant IS NULL THEN
    RAISE EXCEPTION 'Department not found';
  END IF;
  IF _dept_tenant IS DISTINCT FROM _caller_tenant THEN
    RAISE EXCEPTION 'Cross-tenant operation denied: department belongs to another tenant';
  END IF;

  FOR _row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    -- Find student by roll number — SCOPED TO CALLER'S TENANT
    SELECT id INTO _student_id
    FROM profiles
    WHERE UPPER(roll_number) = UPPER(_row->>'roll_number')
      AND department_id = p_department_id
      AND tenant_id = _caller_tenant
    LIMIT 1;

    IF _student_id IS NULL THEN
      _errors := array_append(_errors, 'USN ' || (_row->>'roll_number') || ' not found');
      CONTINUE;
    END IF;

    -- Find subject by code — SCOPED TO CALLER'S TENANT
    SELECT id INTO _subject_id
    FROM subjects
    WHERE UPPER(subject_code) = UPPER(_row->>'subject_code')
      AND department_id = p_department_id
      AND tenant_id = _caller_tenant
    LIMIT 1;

    IF _subject_id IS NULL THEN
      _errors := array_append(_errors, 'Subject ' || (_row->>'subject_code') || ' not found');
      CONTINUE;
    END IF;

    _amount := (_row->>'amount')::NUMERIC;

    -- Update enrollment with fee
    UPDATE subject_enrollment
    SET attendance_fee = _amount,
        attendance_fee_verified = false,
        status = 'rejected'
    WHERE student_id = _student_id AND subject_id = _subject_id;

    IF NOT FOUND THEN
      _errors := array_append(_errors, 'No enrollment for ' || (_row->>'roll_number') || ' in ' || (_row->>'subject_code'));
    ELSE
      _updated := _updated + 1;
    END IF;
  END LOOP;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'Bulk Attendance Dues Set',
    format('Updated: %s, Errors: %s', _updated, array_length(_errors, 1)),
    _caller_tenant
  );

  RETURN json_build_object(
    'updated', _updated,
    'errors', to_jsonb(_errors)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================
-- 4. bulk_promote_students — tenant-scoped
-- =============================================================
CREATE OR REPLACE FUNCTION bulk_promote_students(
  p_student_ids UUID[],
  p_new_semester_id UUID
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _cross_tenant INT;
  _sem_tenant UUID;
  _count INT;
BEGIN
  -- Get caller's tenant
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  -- Verify the target semester belongs to the caller's tenant
  SELECT tenant_id INTO _sem_tenant FROM semesters WHERE id = p_new_semester_id;
  IF _sem_tenant IS DISTINCT FROM _caller_tenant THEN
    RAISE EXCEPTION 'Cross-tenant operation denied: semester belongs to another tenant';
  END IF;

  -- Verify ALL student IDs belong to caller's tenant
  SELECT COUNT(*) INTO _cross_tenant
  FROM profiles
  WHERE id = ANY(p_student_ids)
    AND tenant_id IS DISTINCT FROM _caller_tenant;

  IF _cross_tenant > 0 THEN
    RAISE EXCEPTION 'Cross-tenant operation denied: % students belong to another tenant', _cross_tenant;
  END IF;

  -- Perform the promotion
  UPDATE profiles
  SET semester_id = p_new_semester_id,
      updated_at = now()
  WHERE id = ANY(p_student_ids)
    AND role = 'student'
    AND tenant_id = _caller_tenant;  -- Belt-and-suspenders: re-enforce tenant scope

  GET DIAGNOSTICS _count = ROW_COUNT;

  -- Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'Bulk Student Promotion',
    format('Promoted %s students to new semester', _count),
    _caller_tenant
  );

  RETURN json_build_object('promoted', _count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================
-- 5. assign_teacher_to_section_rpc — tenant-scoped
-- =============================================================
CREATE OR REPLACE FUNCTION assign_teacher_to_section_rpc(
  p_subject_id UUID,
  p_section TEXT,
  p_teacher_id UUID,
  p_semester_id UUID
)
RETURNS JSON AS $$
DECLARE
  _caller_tenant UUID;
  _teacher_tenant UUID;
  _student_ids UUID[];
  _updated INT := 0;
BEGIN
  -- Get caller's tenant
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found or has no tenant';
  END IF;

  -- Verify teacher belongs to caller's tenant
  SELECT tenant_id INTO _teacher_tenant FROM profiles WHERE id = p_teacher_id;
  IF _teacher_tenant IS DISTINCT FROM _caller_tenant THEN
    RAISE EXCEPTION 'Cross-tenant operation denied: teacher belongs to another tenant';
  END IF;

  -- Find students — SCOPED TO CALLER'S TENANT
  SELECT ARRAY_AGG(id) INTO _student_ids
  FROM profiles
  WHERE role = 'student'
    AND section = p_section
    AND semester_id = p_semester_id
    AND tenant_id = _caller_tenant;

  IF _student_ids IS NULL OR array_length(_student_ids, 1) IS NULL THEN
    RETURN json_build_object('inserted', 0, 'updated', 0, 'message', 'No students found');
  END IF;

  -- Upsert enrollments
  INSERT INTO subject_enrollment (student_id, subject_id, teacher_id)
  SELECT unnest(_student_ids), p_subject_id, p_teacher_id
  ON CONFLICT (student_id, subject_id)
  DO UPDATE SET teacher_id = p_teacher_id;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN json_build_object(
    'updated', _updated,
    'student_count', array_length(_student_ids, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
