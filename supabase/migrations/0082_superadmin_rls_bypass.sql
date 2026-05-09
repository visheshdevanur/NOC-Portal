-- 0082_superadmin_rls_bypass.sql (v2)
-- Fix: Allow platform admins to bypass tenant isolation.
-- Uses SECURITY DEFINER functions to avoid circular RLS.

-- 1. Add is_platform_admin column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean DEFAULT false;

-- 2. Mark the existing superadmin
UPDATE profiles SET is_platform_admin = true WHERE id = 'e060c47c-ca6a-462b-ba28-f8cadba4389d';

-- 3. Create a SECURITY DEFINER function to check platform admin status
--    (bypasses RLS, no circular dependency)
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- 4. Create RPC for superadmin login profile lookup (bypasses RLS)
CREATE OR REPLACE FUNCTION get_my_profile_for_auth()
RETURNS TABLE(id uuid, role user_role, is_platform_admin boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.role, p.is_platform_admin
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

-- 5. Fix the profiles RLS: platform admins bypass tenant check
DROP POLICY IF EXISTS "tenant_isolation_profiles" ON profiles;
DROP POLICY IF EXISTS "platform_admin_all_profiles" ON profiles;

CREATE POLICY "tenant_isolation_profiles" ON profiles
  AS RESTRICTIVE FOR ALL
  USING (
    is_platform_admin()
    OR
    tenant_id = get_my_tenant_id()
  );
