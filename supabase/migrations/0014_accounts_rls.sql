-- 0014_accounts_rls.sql
-- Fix RLS policies to allow accounts role to read profiles and departments

-- Use a different alias to prevent recursion, just in case
CREATE POLICY "Accounts can read all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'accounts'
    )
  );

CREATE POLICY "Accounts can read all departments" ON departments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'accounts'
    )
  );
