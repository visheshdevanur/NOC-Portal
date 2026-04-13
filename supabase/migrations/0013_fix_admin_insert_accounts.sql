-- 0013_fix_admin_insert_accounts.sql
-- Allow Admin to create both HODs and Accounts users

DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;
CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    AND role IN ('hod', 'accounts')
  );
