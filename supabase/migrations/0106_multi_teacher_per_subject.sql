-- Allow multiple teachers to be assigned the same subject for the same section
-- Change unique constraint from (student_id, subject_id) to (student_id, subject_id, teacher_id)

ALTER TABLE subject_enrollment DROP CONSTRAINT IF EXISTS subject_enrollment_student_id_subject_id_key;

ALTER TABLE subject_enrollment 
  ADD CONSTRAINT subject_enrollment_student_subject_teacher_unique 
  UNIQUE (student_id, subject_id, teacher_id);

-- Update the RPC to use the new constraint (DO NOTHING instead of overwriting teacher)
CREATE OR REPLACE FUNCTION assign_teacher_to_section_rpc(
  p_subject_id UUID,
  p_section TEXT,
  p_teacher_id UUID,
  p_semester_id UUID,
  p_department_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student_ids UUID[];
  _updated INTEGER;
  _caller_tenant UUID;
BEGIN
  SELECT tenant_id INTO _caller_tenant FROM profiles WHERE id = auth.uid();
  IF _caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Caller has no tenant';
  END IF;

  SELECT ARRAY_AGG(id) INTO _student_ids
  FROM profiles
  WHERE role = 'student'
    AND section = p_section
    AND semester_id = p_semester_id
    AND tenant_id = _caller_tenant;

  IF _student_ids IS NULL OR array_length(_student_ids, 1) IS NULL THEN
    RETURN json_build_object('inserted', 0, 'updated', 0, 'message', 'No students found');
  END IF;

  -- Insert enrollments; skip if this student+subject+teacher combo already exists
  INSERT INTO subject_enrollment (student_id, subject_id, teacher_id)
  SELECT unnest(_student_ids), p_subject_id, p_teacher_id
  ON CONFLICT (student_id, subject_id, teacher_id)
  DO NOTHING;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN json_build_object(
    'updated', _updated,
    'student_count', array_length(_student_ids, 1)
  );
END;
$$ ;
