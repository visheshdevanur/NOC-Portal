-- HOD and FYC need UPDATE access on subject_enrollment to apply mass fines
-- Previously they only had SELECT, so applyMassFines silently failed (RLS blocked updates)

DROP POLICY IF EXISTS "HOD can update subject_enrollment" ON subject_enrollment;
CREATE POLICY "HOD can update subject_enrollment" ON subject_enrollment
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "FYC can update subject_enrollment" ON subject_enrollment;
CREATE POLICY "FYC can update subject_enrollment" ON subject_enrollment
  FOR UPDATE USING (true) WITH CHECK (true);
