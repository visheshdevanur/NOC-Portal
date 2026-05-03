-- 0067_clerk_global_subjects_rls.sql
-- Fix: Clerk is now a global role (no department_id), so the old policy
-- that matched profiles.department_id = subjects.department_id always fails.
-- Allow clerks to insert/update/delete subjects in any department.

DROP POLICY IF EXISTS "Clerk can insert subjects" ON subjects;
CREATE POLICY "Clerk can insert subjects" ON subjects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

DROP POLICY IF EXISTS "Clerk can update subjects" ON subjects;
CREATE POLICY "Clerk can update subjects" ON subjects
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );

DROP POLICY IF EXISTS "Clerk can delete subjects" ON subjects;
CREATE POLICY "Clerk can delete subjects" ON subjects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'clerk')
  );
