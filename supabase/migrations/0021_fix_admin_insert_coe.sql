-- 0021_fix_admin_insert_coe.sql
-- Allow Admin to create COE users in addition to HOD and Accounts

DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;
CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    AND role::text IN ('hod', 'accounts', 'coe')
  );
