-- 0052_clerk_activity_logs_scoped.sql
-- Fix: Clerk activity_logs RLS policy was too broad (all department logs).
-- Now scoped to only show logs of teachers created by the clerk or the clerk's FYC.

DROP POLICY IF EXISTS "Clerks view department logs" ON public.activity_logs;

CREATE POLICY "Clerks view scoped teacher logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles clerk_profile
    WHERE clerk_profile.id = auth.uid()
    AND clerk_profile.role = 'clerk'
  )
  AND (
    -- Can view own logs
    auth.uid() = activity_logs.user_id
    OR
    -- Can view logs of teachers created by the clerk or by the clerk's FYC
    EXISTS (
      SELECT 1 FROM profiles target_profile
      WHERE target_profile.id = activity_logs.user_id
        AND target_profile.role IN ('teacher', 'faculty')
        AND (
          target_profile.created_by = auth.uid()
          OR target_profile.created_by = (
            SELECT created_by FROM profiles WHERE id = auth.uid()
          )
        )
    )
  )
);
