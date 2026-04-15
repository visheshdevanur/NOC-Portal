-- 0026_ia_attendance.sql
-- IA Attendance tracking & auto-clearance based on ≥2 IAs present

-- ============================================================
-- 1. CREATE ia_attendance TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ia_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ia_number INT NOT NULL CHECK (ia_number >= 1),
  is_present BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subject_id, ia_number)
);

-- ============================================================
-- 2. RLS POLICIES
-- ============================================================
ALTER TABLE ia_attendance ENABLE ROW LEVEL SECURITY;

-- Teachers can see IA records they created
CREATE POLICY "Faculty can select own ia_attendance" ON ia_attendance
  FOR SELECT USING (teacher_id = auth.uid());

-- Teachers can insert IA records for their subjects
CREATE POLICY "Faculty can insert ia_attendance" ON ia_attendance
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

-- Teachers can update IA records they created
CREATE POLICY "Faculty can update ia_attendance" ON ia_attendance
  FOR UPDATE USING (teacher_id = auth.uid());

-- Students can view their own IA attendance
CREATE POLICY "Students can view own ia_attendance" ON ia_attendance
  FOR SELECT USING (student_id = auth.uid());

-- Admin, HOD, Staff can view all IA attendance
CREATE POLICY "Admin HOD Staff can view all ia_attendance" ON ia_attendance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hod', 'staff'))
  );

-- ============================================================
-- 3. AUTO-CLEARANCE TRIGGER FUNCTION
-- ============================================================
-- When IA attendance is inserted or updated, automatically evaluate
-- if the student qualifies for faculty clearance (≥2 IAs present).
CREATE OR REPLACE FUNCTION evaluate_ia_clearance()
RETURNS TRIGGER AS $$
DECLARE
  present_count INT;
  enrollment_id UUID;
BEGIN
  -- Count how many IAs the student was marked present for this subject
  SELECT COUNT(*) INTO present_count
  FROM ia_attendance
  WHERE student_id = NEW.student_id
    AND subject_id = NEW.subject_id
    AND is_present = TRUE;

  -- Find the corresponding subject_enrollment row
  SELECT id INTO enrollment_id
  FROM subject_enrollment
  WHERE student_id = NEW.student_id
    AND subject_id = NEW.subject_id;

  -- Only update if enrollment exists
  IF enrollment_id IS NOT NULL THEN
    IF present_count >= 2 THEN
      UPDATE subject_enrollment
      SET status = 'completed',
          remarks = 'Cleared: IA attendance sufficient (' || present_count || ' IAs attended)'
      WHERE id = enrollment_id;
    ELSE
      UPDATE subject_enrollment
      SET status = 'rejected',
          remarks = 'Insufficient IA Attendance (' || present_count || '/2 required)'
      WHERE id = enrollment_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. ATTACH TRIGGER
-- ============================================================
DROP TRIGGER IF EXISTS trg_evaluate_ia_clearance ON ia_attendance;
CREATE TRIGGER trg_evaluate_ia_clearance
AFTER INSERT OR UPDATE ON ia_attendance
FOR EACH ROW
EXECUTE FUNCTION evaluate_ia_clearance();

-- ============================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================
CREATE TRIGGER trg_ia_attendance_updated_at
BEFORE UPDATE ON ia_attendance
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
