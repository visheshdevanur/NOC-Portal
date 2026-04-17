-- 0039_fix_ia_attendance_rls.sql
DROP POLICY IF EXISTS "Faculty can insert ia_attendance" ON ia_attendance;
DROP POLICY IF EXISTS "Faculty can update ia_attendance" ON ia_attendance;
DROP POLICY IF EXISTS "Faculty can select own ia_attendance" ON ia_attendance;

CREATE POLICY "Faculty can modify ia_attendance" ON ia_attendance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty', 'teacher', 'coe', 'admin', 'hod'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty', 'teacher', 'coe', 'admin', 'hod'))
  );

-- Drop the dangerous trigger that overwrites our complex UI logic!
DROP TRIGGER IF EXISTS trg_evaluate_ia_clearance ON ia_attendance;
DROP FUNCTION IF EXISTS evaluate_ia_clearance();
