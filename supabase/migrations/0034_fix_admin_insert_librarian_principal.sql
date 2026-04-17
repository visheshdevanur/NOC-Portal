-- 0034_fix_admin_insert_librarian_principal.sql
-- Allow Admin to create Librarian and Principal users in addition to HOD, Accounts, and COE

DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;
CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    AND role::text IN ('hod', 'accounts', 'coe', 'librarian', 'principal')
  );
