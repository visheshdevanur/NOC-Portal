-- ============================================================
-- Phase 2: RLS Optimization + Bulk RPCs + Performance Indexes
-- ============================================================

-- ============================================================
-- 1. OPTIMIZED tenant_id resolution using JWT claims
--    Instead of querying profiles on every row check,
--    read tenant_id from the JWT app_metadata (set during user creation).
--    Falls back to DB lookup for users without the claim.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
DECLARE
  _tid UUID;
BEGIN
  -- Fast path: read from JWT app_metadata (no DB query)
  _tid := (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID;
  IF _tid IS NOT NULL THEN
    RETURN _tid;
  END IF;
  
  -- Slow fallback: query profiles (for legacy users without the claim)
  SELECT tenant_id INTO _tid FROM profiles WHERE id = auth.uid();
  RETURN _tid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 2. BULK COLLEGE DUES PROCESSING RPC
--    Replaces O(N) client-side loop with single atomic DB call.
--    Input: array of pending due IDs + amounts, array of all due IDs
-- ============================================================

CREATE OR REPLACE FUNCTION bulk_process_college_dues(
  p_pending_ids UUID[],
  p_pending_amounts NUMERIC[],
  p_all_ids UUID[]
)
RETURNS JSON AS $$
DECLARE
  _no_dues_ids UUID[];
  _i INT;
  _updated_pending INT := 0;
  _updated_cleared INT := 0;
BEGIN
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
  FOR _i IN 1..array_length(p_pending_ids, 1) LOOP
    UPDATE student_dues
    SET status = 'pending',
        fine_amount = p_pending_amounts[_i],
        updated_at = now()
    WHERE id = p_pending_ids[_i];
    
    _updated_pending := _updated_pending + 1;
  END LOOP;

  RETURN json_build_object(
    'pending_updated', _updated_pending,
    'cleared_updated', _updated_cleared
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. BULK LIBRARY DUES PROCESSING RPC
--    Replaces O(N) client-side chunked loops with single atomic call.
--    Input: array of roll numbers for students who have NOT paid
-- ============================================================

CREATE OR REPLACE FUNCTION bulk_process_library_dues(
  p_not_paid_rolls TEXT[]
)
RETURNS JSON AS $$
DECLARE
  _not_paid_count INT;
  _cleared_count INT;
  _upper_rolls TEXT[];
BEGIN
  -- Normalize to uppercase
  _upper_rolls := ARRAY(SELECT UPPER(UNNEST(p_not_paid_rolls)));

  -- Mark students in the list as having dues
  UPDATE library_dues ld
  SET has_dues = true,
      permitted = false,
      remarks = 'Not paid — bulk upload',
      updated_at = now()
  FROM profiles p
  WHERE ld.student_id = p.id
    AND UPPER(p.roll_number) = ANY(_upper_rolls);
  
  GET DIAGNOSTICS _not_paid_count = ROW_COUNT;

  -- Auto-clear everyone else
  UPDATE library_dues ld
  SET has_dues = false,
      permitted = false,
      fine_amount = 0,
      remarks = 'Cleared — not in upload list',
      updated_at = now()
  FROM profiles p
  WHERE ld.student_id = p.id
    AND (p.roll_number IS NULL OR UPPER(p.roll_number) != ALL(_upper_rolls));
  
  GET DIAGNOSTICS _cleared_count = ROW_COUNT;

  RETURN json_build_object(
    'not_paid', _not_paid_count,
    'cleared', _cleared_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. BULK ATTENDANCE DUES CSV PROCESSING RPC
--    Replaces O(N) row-by-row client loop.
--    Input: department_id + array of {roll_number, subject_code, amount}
-- ============================================================

CREATE OR REPLACE FUNCTION bulk_set_attendance_dues(
  p_department_id UUID,
  p_rows JSONB
)
RETURNS JSON AS $$
DECLARE
  _row JSONB;
  _student_id UUID;
  _subject_id UUID;
  _amount NUMERIC;
  _updated INT := 0;
  _errors TEXT[] := '{}';
BEGIN
  FOR _row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    -- Find student by roll number
    SELECT id INTO _student_id
    FROM profiles
    WHERE UPPER(roll_number) = UPPER(_row->>'roll_number')
      AND department_id = p_department_id
    LIMIT 1;

    IF _student_id IS NULL THEN
      _errors := array_append(_errors, 'USN ' || (_row->>'roll_number') || ' not found');
      CONTINUE;
    END IF;

    -- Find subject by code
    SELECT id INTO _subject_id
    FROM subjects
    WHERE UPPER(subject_code) = UPPER(_row->>'subject_code')
      AND department_id = p_department_id
    LIMIT 1;

    IF _subject_id IS NULL THEN
      _errors := array_append(_errors, 'Subject ' || (_row->>'subject_code') || ' not found');
      CONTINUE;
    END IF;

    _amount := (_row->>'amount')::NUMERIC;

    -- Update or insert enrollment with fee
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

  RETURN json_build_object(
    'updated', _updated,
    'errors', to_jsonb(_errors)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. BULK PROMOTE STUDENTS RPC
--    Replaces O(N) client-side semester promotion loop.
-- ============================================================

CREATE OR REPLACE FUNCTION bulk_promote_students(
  p_student_ids UUID[],
  p_new_semester_id UUID
)
RETURNS JSON AS $$
DECLARE
  _count INT;
BEGIN
  UPDATE profiles
  SET semester_id = p_new_semester_id,
      updated_at = now()
  WHERE id = ANY(p_student_ids)
    AND role = 'student';

  GET DIAGNOSTICS _count = ROW_COUNT;

  RETURN json_build_object('promoted', _count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. PERFORMANCE INDEXES
--    Critical for 50,000 users — prevent full table scans
-- ============================================================

-- Core lookup indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_semester ON profiles(semester_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_roll_number ON profiles(roll_number);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON profiles(created_by);

-- Clearance pipeline indexes
CREATE INDEX IF NOT EXISTS idx_clearance_requests_student ON clearance_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_clearance_requests_stage ON clearance_requests(current_stage);
CREATE INDEX IF NOT EXISTS idx_clearance_requests_status ON clearance_requests(status);
CREATE INDEX IF NOT EXISTS idx_clearance_requests_dept ON clearance_requests(department_id);

-- Enrollment indexes (critical for attendance/fine queries)
CREATE INDEX IF NOT EXISTS idx_enrollment_student ON subject_enrollment(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_subject ON subject_enrollment(subject_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_teacher ON subject_enrollment(teacher_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_fee ON subject_enrollment(attendance_fee) WHERE attendance_fee > 0;
CREATE INDEX IF NOT EXISTS idx_enrollment_fee_verified ON subject_enrollment(attendance_fee_verified) WHERE attendance_fee > 0;

-- Dues indexes
CREATE INDEX IF NOT EXISTS idx_student_dues_student ON student_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_student_dues_status ON student_dues(status);
CREATE INDEX IF NOT EXISTS idx_library_dues_student ON library_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_library_dues_has_dues ON library_dues(has_dues);

-- Activity logs (frequently queried for dashboards)
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_dept ON activity_logs(department_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- Subjects lookup
CREATE INDEX IF NOT EXISTS idx_subjects_department ON subjects(department_id);
CREATE INDEX IF NOT EXISTS idx_subjects_semester ON subjects(semester_id);
CREATE INDEX IF NOT EXISTS idx_subjects_code ON subjects(subject_code);

-- Semesters lookup
CREATE INDEX IF NOT EXISTS idx_semesters_department ON semesters(department_id);

-- Departments by tenant
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);

-- Composite indexes for common join patterns
CREATE INDEX IF NOT EXISTS idx_profiles_dept_role ON profiles(department_id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_dept_semester ON profiles(department_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_student_subject ON subject_enrollment(student_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_clearance_dept_status ON clearance_requests(department_id, status);
