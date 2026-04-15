-- 0027_staff_fees_and_promotion.sql
-- Adds paid_amount tracking and semester promotion support

-- 1. Add paid_amount column to student_dues
ALTER TABLE student_dues ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- 2. Allow staff to update student_dues for their department
CREATE POLICY "Staff can update paid_amount" ON student_dues
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'staff'
        AND EXISTS (
          SELECT 1 FROM profiles sp
          WHERE sp.id = student_dues.student_id
            AND sp.department_id = p.department_id
        )
    )
  );

-- 3. Promote students function (semester-wise)
CREATE OR REPLACE FUNCTION promote_students_to_semester(
  p_source_semester_id UUID,
  p_target_semester_id UUID,
  p_department_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER := 0;
  student_row RECORD;
BEGIN
  -- Get all students in source semester + department
  FOR student_row IN
    SELECT id FROM profiles
    WHERE semester_id = p_source_semester_id
      AND department_id = p_department_id
      AND role = 'student'
  LOOP
    -- Delete old clearance request
    DELETE FROM clearance_requests WHERE student_id = student_row.id;
    
    -- Delete old subject enrollments
    DELETE FROM subject_enrollment WHERE student_id = student_row.id;
    
    -- Delete old IA attendance
    DELETE FROM ia_attendance WHERE student_id = student_row.id;
    
    -- Update student semester
    UPDATE profiles SET semester_id = p_target_semester_id WHERE id = student_row.id;
    
    -- Reset/create fresh student_dues entry
    UPDATE student_dues 
    SET fine_amount = 0, paid_amount = 0, status = 'pending', updated_at = NOW()
    WHERE student_id = student_row.id;
    
    -- If no dues entry exists, create one
    INSERT INTO student_dues (student_id)
    VALUES (student_row.id)
    ON CONFLICT (student_id) DO NOTHING;
    
    affected_count := affected_count + 1;
  END LOOP;
  
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
