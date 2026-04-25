-- 0046_add_clerk_role.sql
-- Add 'clerk' role and update FYC RLS policies. Migrate FYC-created staff to clerk.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'clerk';

-- We use a DO block or just direct statement.
UPDATE profiles
SET role = 'clerk'
WHERE role = 'staff' AND created_by IS NOT NULL AND EXISTS (
  SELECT 1 FROM profiles fyc_p WHERE fyc_p.id = profiles.created_by AND fyc_p.role = 'fyc'
);

DROP POLICY IF EXISTS "FYC can insert profiles" ON profiles;
CREATE POLICY "FYC can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role IN ('clerk', 'teacher')
  );

DROP POLICY IF EXISTS "FYC can delete profiles" ON profiles;
CREATE POLICY "FYC can delete profiles" ON profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role IN ('clerk', 'teacher')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "FYC can update profiles" ON profiles;
CREATE POLICY "FYC can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'fyc')
    AND role IN ('clerk', 'teacher')
    AND created_by = auth.uid()
  );
