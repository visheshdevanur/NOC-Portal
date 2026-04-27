-- 0051_clerk_select_policies.sql
-- Fix: Clerk role missing SELECT permissions on subject_enrollment and library_dues
-- This is why attendance fines and library dues were not showing in the Clerk dashboard

-- 1. Allow Clerk to VIEW subject_enrollment (attendance fines)
DROP POLICY IF EXISTS "Clerk can view subject_enrollment" ON subject_enrollment;
CREATE POLICY "Clerk can view subject_enrollment" ON subject_enrollment
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

-- 2. Allow Clerk to VIEW library_dues
DROP POLICY IF EXISTS "Clerk can view library_dues" ON library_dues;
CREATE POLICY "Clerk can view library_dues" ON library_dues
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

-- 3. Allow Clerk to VIEW subjects (needed for section assignment & subject management)
DROP POLICY IF EXISTS "Clerk can view subjects" ON subjects;
CREATE POLICY "Clerk can view subjects" ON subjects
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );
