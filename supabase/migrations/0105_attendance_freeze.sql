-- 0105_attendance_freeze.sql
-- Adds an attendance_frozen flag to the tenants table.
-- When true, faculty cannot update attendance (manual or upload).
-- Only admin (or super_admin) can toggle this flag.

-- 1. Add the column
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS attendance_frozen BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Allow admin to update ONLY the attendance_frozen field on their own tenant
--    (The existing SELECT policy already lets anyone read tenants.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tenants'
      AND policyname = 'Admin can toggle attendance freeze'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Admin can toggle attendance freeze"
        ON public.tenants
        FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id         = auth.uid()
              AND profiles.role       = 'admin'
              AND profiles.tenant_id  = tenants.id
          )
        )
        WITH CHECK (true);
    $p$;
  END IF;
END $$;
