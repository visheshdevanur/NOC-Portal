-- 0053_fyc_fine_approvals_policies.sql
-- Fix: FYC dashboard "Fine Approvals" tab shows empty because FYC role
-- has no SELECT policy on subject_enrollment or subjects tables.

-- 1. Allow FYC to VIEW subject_enrollment (needed for fine approvals)
DROP POLICY IF EXISTS "FYC can view subject_enrollment" ON subject_enrollment;
CREATE POLICY "FYC can view subject_enrollment" ON subject_enrollment
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'fyc')
  );

-- 2. Allow FYC to VIEW subjects (needed for fine approval join + teacher details)
DROP POLICY IF EXISTS "FYC can view subjects" ON subjects;
CREATE POLICY "FYC can view subjects" ON subjects
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'fyc')
  );
