-- 0056_fix_promotion_cascade.sql
-- Fix: Process semesters in DESCENDING order to prevent students from cascading
-- through multiple promotions in a single run.

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
    FOR sem IN 
      SELECT s.id, s.name,
        CASE 
          WHEN s.name ~ '^\d+$' THEN s.name::INTEGER
          ELSE NULL
        END AS sem_num
      FROM semesters s
      WHERE s.department_id = dept.id
      ORDER BY 
        CASE WHEN s.name ~ '^\d+$' THEN s.name::INTEGER ELSE -1 END DESC
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

        -- Update semester (section is KEPT as-is for all transitions)
        UPDATE profiles SET semester_id = next_sem.id WHERE id = student_row.id;

        -- Special: 2nd → 3rd sem: remove from FYC/clerk dashboard only (clear created_by)
        -- Section is NOT cleared — it persists until staff reassigns
        IF sem_number = 2 THEN
          UPDATE profiles SET created_by = NULL WHERE id = student_row.id;
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
