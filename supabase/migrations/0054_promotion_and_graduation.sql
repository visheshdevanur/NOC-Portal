-- 0054_promotion_and_graduation.sql
-- Student Promotion System: adds status/batch columns and promotion RPC

-- ==========================================
-- 1. ADD STATUS AND BATCH COLUMNS
-- ==========================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS batch TEXT;

-- ==========================================
-- 2. EXPORT PRE-PROMOTION DATA (for CSV download)
-- ==========================================
CREATE OR REPLACE FUNCTION export_pre_promotion_data()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Only admin can call this
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can export promotion data';
  END IF;

  SELECT json_build_object(
    'students', (
      SELECT json_agg(row_to_json(s))
      FROM (
        SELECT 
          p.id,
          p.full_name,
          p.roll_number,
          p.section,
          p.status,
          d.name AS department,
          sem.name AS semester,
          COALESCE(cr.current_stage::text, 'none') AS clearance_stage,
          COALESCE(cr.status::text, 'none') AS clearance_status
        FROM profiles p
        LEFT JOIN departments d ON d.id = p.department_id
        LEFT JOIN semesters sem ON sem.id = p.semester_id
        LEFT JOIN clearance_requests cr ON cr.student_id = p.id
        WHERE p.role = 'student' AND COALESCE(p.status, 'active') = 'active'
        ORDER BY d.name, sem.name, p.section, p.full_name
      ) s
    ),
    'enrollments', (
      SELECT json_agg(row_to_json(e))
      FROM (
        SELECT 
          p.full_name AS student_name,
          p.roll_number,
          sub.subject_name,
          sub.subject_code,
          se.attendance_pct,
          se.status AS enrollment_status,
          se.remarks,
          se.attendance_fee,
          se.attendance_fee_verified
        FROM subject_enrollment se
        JOIN profiles p ON p.id = se.student_id
        JOIN subjects sub ON sub.id = se.subject_id
        WHERE p.role = 'student' AND COALESCE(p.status, 'active') = 'active'
        ORDER BY p.full_name, sub.subject_name
      ) e
    ),
    'ia_attendance', (
      SELECT json_agg(row_to_json(ia))
      FROM (
        SELECT 
          p.full_name AS student_name,
          p.roll_number,
          sub.subject_name,
          sub.subject_code,
          ia.ia_number,
          ia.is_present
        FROM ia_attendance ia
        JOIN profiles p ON p.id = ia.student_id
        JOIN subjects sub ON sub.id = ia.subject_id
        WHERE p.role = 'student' AND COALESCE(p.status, 'active') = 'active'
        ORDER BY p.full_name, sub.subject_name, ia.ia_number
      ) ia
    ),
    'dues', (
      SELECT json_agg(row_to_json(du))
      FROM (
        SELECT 
          p.full_name AS student_name,
          p.roll_number,
          sd.fine_amount AS college_fee,
          sd.paid_amount AS college_paid,
          sd.status AS college_status,
          ld.fine_amount AS library_fine,
          ld.has_dues AS library_has_dues
        FROM profiles p
        LEFT JOIN student_dues sd ON sd.student_id = p.id
        LEFT JOIN library_dues ld ON ld.student_id = p.id
        WHERE p.role = 'student' AND COALESCE(p.status, 'active') = 'active'
        ORDER BY p.full_name
      ) du
    ),
    'exported_at', NOW()
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 3. PROMOTE ALL STUDENTS RPC
-- ==========================================
CREATE OR REPLACE FUNCTION promote_all_students()
RETURNS JSON AS $$
DECLARE
  dept RECORD;
  sem RECORD;
  next_sem RECORD;
  student_row RECORD;
  sem_number INTEGER;
  next_sem_number INTEGER;
  promoted_count INTEGER := 0;
  graduated_count INTEGER := 0;
  section_cleared_count INTEGER := 0;
  dept_results JSON[] := ARRAY[]::JSON[];
  dept_promoted INTEGER;
  dept_graduated INTEGER;
  dept_section_cleared INTEGER;
  current_year TEXT;
BEGIN
  -- Only admin can call this
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can promote students';
  END IF;

  current_year := EXTRACT(YEAR FROM NOW())::TEXT;

  -- Loop through each department
  FOR dept IN SELECT id, name FROM departments ORDER BY name
  LOOP
    dept_promoted := 0;
    dept_graduated := 0;
    dept_section_cleared := 0;

    -- Get all semesters for this department, try to extract numeric value
    -- Semester names are expected to be numeric: "1", "2", ..., "8"
    FOR sem IN 
      SELECT s.id, s.name,
        CASE 
          WHEN s.name ~ '^\d+$' THEN s.name::INTEGER
          ELSE NULL
        END AS sem_num
      FROM semesters s
      WHERE s.department_id = dept.id
      ORDER BY 
        CASE WHEN s.name ~ '^\d+$' THEN s.name::INTEGER ELSE 999 END
    LOOP
      -- Skip non-numeric semesters
      IF sem.sem_num IS NULL THEN
        CONTINUE;
      END IF;

      sem_number := sem.sem_num;

      -- Handle 8th semester → graduation
      IF sem_number = 8 THEN
        FOR student_row IN
          SELECT id FROM profiles
          WHERE semester_id = sem.id
            AND department_id = dept.id
            AND role = 'student'
            AND COALESCE(status, 'active') = 'active'
        LOOP
          -- Clean up old records
          DELETE FROM clearance_requests WHERE student_id = student_row.id;
          DELETE FROM subject_enrollment WHERE student_id = student_row.id;
          DELETE FROM ia_attendance WHERE student_id = student_row.id;
          DELETE FROM student_dues WHERE student_id = student_row.id;
          DELETE FROM library_dues WHERE student_id = student_row.id;

          -- Move to graduated
          UPDATE profiles 
          SET status = 'graduated',
              batch = current_year,
              semester_id = NULL,
              section = NULL
          WHERE id = student_row.id;

          dept_graduated := dept_graduated + 1;
          graduated_count := graduated_count + 1;
        END LOOP;

        CONTINUE; -- Skip finding next semester for 8th
      END IF;

      -- Find the next semester (sem_number + 1) in the same department
      next_sem_number := sem_number + 1;
      SELECT s.id, s.name INTO next_sem
      FROM semesters s
      WHERE s.department_id = dept.id
        AND s.name = next_sem_number::TEXT
      LIMIT 1;

      -- If no next semester exists, skip
      IF next_sem.id IS NULL THEN
        CONTINUE;
      END IF;

      -- Promote students from current sem to next sem
      FOR student_row IN
        SELECT id FROM profiles
        WHERE semester_id = sem.id
          AND department_id = dept.id
          AND role = 'student'
          AND COALESCE(status, 'active') = 'active'
      LOOP
        -- Clean up old records
        DELETE FROM clearance_requests WHERE student_id = student_row.id;
        DELETE FROM subject_enrollment WHERE student_id = student_row.id;
        DELETE FROM ia_attendance WHERE student_id = student_row.id;
        
        -- Reset student_dues
        UPDATE student_dues 
        SET fine_amount = 0, paid_amount = 0, status = 'pending', updated_at = NOW()
        WHERE student_id = student_row.id;

        -- Reset library_dues
        UPDATE library_dues 
        SET has_dues = false, fine_amount = 0, paid_amount = 0, remarks = NULL, updated_at = NOW()
        WHERE student_id = student_row.id;

        -- Update semester
        UPDATE profiles SET semester_id = next_sem.id WHERE id = student_row.id;

        -- Special: 2nd → 3rd sem: clear section for reassignment
        IF sem_number = 2 THEN
          UPDATE profiles SET section = NULL WHERE id = student_row.id;
          dept_section_cleared := dept_section_cleared + 1;
          section_cleared_count := section_cleared_count + 1;
        END IF;

        dept_promoted := dept_promoted + 1;
        promoted_count := promoted_count + 1;
      END LOOP;
    END LOOP;

    -- Add department result
    dept_results := array_append(dept_results, json_build_object(
      'department', dept.name,
      'promoted', dept_promoted,
      'graduated', dept_graduated,
      'sections_cleared', dept_section_cleared
    ));
  END LOOP;

  RETURN json_build_object(
    'total_promoted', promoted_count,
    'total_graduated', graduated_count,
    'total_sections_cleared', section_cleared_count,
    'departments', to_json(dept_results),
    'promoted_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 4. RLS: Allow admin to update profiles for promotion
-- ==========================================
-- Admin already has broad update access via existing policies.
-- The RPC functions use SECURITY DEFINER so they bypass RLS.
-- No additional policies needed.
