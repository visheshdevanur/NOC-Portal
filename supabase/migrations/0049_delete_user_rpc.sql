-- 0049_delete_user_rpc.sql
-- 1. Create a secure RPC for deleting users based on RBAC
-- 2. Add RLS policy for FYC to view activity logs of users they created

-- ==============================================================================
-- 1. Admin Delete User RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS void AS $$
DECLARE
  caller_role TEXT;
  caller_dept UUID;
  target_role TEXT;
  target_dept UUID;
  target_creator UUID;
BEGIN
  -- Get caller details
  SELECT role, department_id INTO caller_role, caller_dept FROM profiles WHERE id = auth.uid();
  
  -- Get target details
  SELECT role, department_id, created_by INTO target_role, target_dept, target_creator FROM profiles WHERE id = target_user_id;

  -- Authorization logic:
  IF caller_role = 'admin' THEN
    -- Admin can delete anyone
  ELSIF caller_role = 'hod' AND caller_dept = target_dept AND target_role IN ('staff', 'teacher', 'faculty', 'clerk', 'student') THEN
    -- HOD can delete anyone in their dept
  ELSIF caller_role = 'staff' AND caller_dept = target_dept AND target_role IN ('student', 'teacher', 'faculty') THEN
    -- Staff can delete students/teachers in their dept
  ELSIF caller_role = 'clerk' AND caller_dept = target_dept AND target_role IN ('student', 'teacher', 'faculty') THEN
    -- Clerk can delete students/teachers in their dept
  ELSIF caller_role = 'fyc' AND target_role IN ('clerk', 'teacher', 'faculty', 'student') AND target_creator = auth.uid() THEN
    -- FYC can delete clerks/teachers/students they created
  ELSE
    RAISE EXCEPTION 'Not authorized to delete this user. Insufficient permissions or hierarchy mismatch.';
  END IF;

  -- Delete from auth.users (this will cascade to profiles and subject_enrollments due to ON DELETE CASCADE)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- 2. FYC Activity Logs RLS Policy
-- ==============================================================================
-- Allow FYC to view activity logs for users they have created.
DROP POLICY IF EXISTS "FYCs view their created users logs" ON public.activity_logs;
CREATE POLICY "FYCs view their created users logs" 
ON public.activity_logs FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles caller_profile 
    WHERE caller_profile.id = auth.uid() 
      AND caller_profile.role = 'fyc'
  )
  AND (
    -- Can view their own logs
    auth.uid() = activity_logs.user_id
    OR 
    -- Can view logs of users they created
    EXISTS (
      SELECT 1 FROM profiles target_profile 
      WHERE target_profile.id = activity_logs.user_id 
        AND target_profile.created_by = auth.uid()
    )
  )
);
