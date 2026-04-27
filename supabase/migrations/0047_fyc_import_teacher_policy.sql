-- 0047_fyc_import_teacher_policy.sql
-- Allow FYC to import teachers by updating created_by on existing teacher/faculty profiles
-- The existing policy only allows updating profiles where created_by = auth.uid(),
-- which prevents importing teachers whose created_by is NULL.

-- Drop and recreate the FYC update policy to allow importing teachers
DROP POLICY IF EXISTS "FYC can update profiles" ON profiles;

-- FYC can update profiles they own (created_by = auth.uid()) OR
-- teacher/faculty profiles they want to import (where created_by IS NULL)
CREATE POLICY "FYC can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role IN ('clerk', 'teacher', 'faculty')
    AND (created_by = auth.uid() OR created_by IS NULL)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role IN ('clerk', 'teacher', 'faculty')
  );

-- Also update insert policy to include 'faculty' role
DROP POLICY IF EXISTS "FYC can insert profiles" ON profiles;
CREATE POLICY "FYC can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role IN ('clerk', 'teacher', 'faculty')
  );

-- Also update delete policy to include 'faculty' role
DROP POLICY IF EXISTS "FYC can delete profiles" ON profiles;
CREATE POLICY "FYC can delete profiles" ON profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role IN ('clerk', 'teacher', 'faculty')
    AND created_by = auth.uid()
  );
