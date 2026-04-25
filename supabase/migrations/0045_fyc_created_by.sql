-- 0045_fyc_created_by.sql
-- Add created_by column to profiles so FYC can track which staff they created

-- 1. Add created_by column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2. Update FYC RLS policies to restrict to staff they created

-- FYC can only INSERT staff profiles (created_by is set to auth.uid())
DROP POLICY IF EXISTS "FYC can insert profiles" ON profiles;
CREATE POLICY "FYC can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role = 'staff'
  );

-- FYC can only DELETE staff they created
DROP POLICY IF EXISTS "FYC can delete profiles" ON profiles;
CREATE POLICY "FYC can delete profiles" ON profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role = 'staff'
    AND created_by = auth.uid()
  );

-- FYC can only UPDATE staff they created
DROP POLICY IF EXISTS "FYC can update profiles" ON profiles;
CREATE POLICY "FYC can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role = 'staff'
    AND created_by = auth.uid()
  );
