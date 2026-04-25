-- 0044_fyc_rls_policies.sql
-- Fix RLS policies to allow Admin to create FYC, Accounts, COE, etc.
-- And allow FYC to create/delete Staff users

-- 1. Fix Admin Profile Insertion
-- Admin/Principal should be able to create HOD, FYC, Accounts, COE, and Librarian.
DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;
CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'principal'))
    AND role IN ('hod', 'fyc', 'accounts', 'coe', 'librarian')
  );

-- 2. Allow FYC to manage Staff
DROP POLICY IF EXISTS "FYC can insert profiles" ON profiles;
CREATE POLICY "FYC can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role = 'staff'
  );

DROP POLICY IF EXISTS "FYC can delete profiles" ON profiles;
CREATE POLICY "FYC can delete profiles" ON profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role = 'staff'
  );

DROP POLICY IF EXISTS "FYC can update profiles" ON profiles;
CREATE POLICY "FYC can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role = 'staff'
  );
