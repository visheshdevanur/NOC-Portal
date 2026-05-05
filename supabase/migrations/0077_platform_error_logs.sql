-- 0077_platform_error_logs.sql
-- Platform-wide error log table for the Developer Portal.
-- Errors are inserted via:
--   (a) Supabase Edge Function `log-error` (frontend-triggered validation errors)
--   (b) DB trigger calls to log_platform_error() (DB-level constraint violations)
-- The Super Admin portal reads this table via service_role (supabaseAdmin client).

-- ============================================================
-- 1. Create the platform_error_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_error_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  tenant_name      TEXT,
  dashboard_name   TEXT NOT NULL,
  nav_path         TEXT,
  error_code       TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'CRITICAL'
                     CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
  error_detail     TEXT NOT NULL,
  triggered_by_role  TEXT,
  triggered_by_email TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: enabled but service_role bypasses automatically.
-- Regular tenant users should NOT be able to read/write this table.
ALTER TABLE public.platform_error_logs ENABLE ROW LEVEL SECURITY;

-- No permissive policy for authenticated users — only service_role reads/writes.
-- The Edge Function runs with service_role key so it bypasses RLS entirely.

-- ============================================================
-- 2. Indexes for fast portal queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_platform_error_logs_tenant
  ON public.platform_error_logs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_platform_error_logs_severity
  ON public.platform_error_logs(severity);

CREATE INDEX IF NOT EXISTS idx_platform_error_logs_error_code
  ON public.platform_error_logs(error_code);

CREATE INDEX IF NOT EXISTS idx_platform_error_logs_dashboard
  ON public.platform_error_logs(dashboard_name);

CREATE INDEX IF NOT EXISTS idx_platform_error_logs_created
  ON public.platform_error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_error_logs_role
  ON public.platform_error_logs(triggered_by_role);

-- ============================================================
-- 3. DB-level helper function for trigger-originated errors
--    Called by PL/pgSQL triggers when they catch a violation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_platform_error(
  p_tenant_id        UUID,
  p_tenant_name      TEXT,
  p_dashboard_name   TEXT,
  p_nav_path         TEXT,
  p_error_code       TEXT,
  p_severity         TEXT,
  p_error_detail     TEXT,
  p_triggered_role   TEXT DEFAULT NULL,
  p_triggered_email  TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.platform_error_logs (
    tenant_id,
    tenant_name,
    dashboard_name,
    nav_path,
    error_code,
    severity,
    error_detail,
    triggered_by_role,
    triggered_by_email
  ) VALUES (
    p_tenant_id,
    p_tenant_name,
    p_dashboard_name,
    p_nav_path,
    p_error_code,
    p_severity,
    p_error_detail,
    p_triggered_role,
    p_triggered_email
  );
EXCEPTION
  -- Never let error logging itself crash a transaction
  WHEN OTHERS THEN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Update fine_category_authorization trigger to also log
--    errors to platform_error_logs when violations occur.
--    We REPLACE the existing function from migration 0076
--    to add the log_platform_error() calls.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_fine_category_authorization()
RETURNS TRIGGER AS $$
DECLARE
  user_role      TEXT;
  user_dept_id   UUID;
  user_email     TEXT;
  tenant_nm      TEXT;
  my_tenant_id   UUID;
BEGIN
  -- Get current user's role, dept, email
  SELECT p.role, p.department_id, p.tenant_id, p.email
  INTO user_role, user_dept_id, my_tenant_id, user_email
  FROM profiles p WHERE p.id = auth.uid();

  -- Get tenant name for logging
  SELECT name INTO tenant_nm FROM tenants WHERE id = my_tenant_id;

  -- Admin bypasses all checks
  IF user_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- ---- FYC RULES ----
  IF user_role = 'fyc' THEN
    IF NEW.is_first_year IS NOT NULL AND NEW.is_first_year = false THEN
      PERFORM log_platform_error(
        my_tenant_id, tenant_nm,
        'Fine Category Management',
        'FYC → Fine Category Management → Create Category',
        'ERR_FINE_ROLE_UNAUTHORIZED',
        'CRITICAL',
        'FYC attempted to create a non-first-year fine category. FYC can only manage Sem 1 & 2 fine categories.',
        user_role, user_email
      );
      RAISE EXCEPTION 'ERR_FINE_ROLE_UNAUTHORIZED: FYC can only create fine categories for first year (Sem 1 & 2)';
    END IF;
    NEW.is_first_year := true;
    RETURN NEW;
  END IF;

  -- ---- HOD RULES ----
  IF user_role = 'hod' THEN
    IF NEW.department_id != user_dept_id THEN
      PERFORM log_platform_error(
        my_tenant_id, tenant_nm,
        'Fine Category Management',
        'HOD → Fine Category Management → Create Category',
        'ERR_FINE_ROLE_UNAUTHORIZED',
        'CRITICAL',
        'HOD attempted to create a fine category for a department other than their own.',
        user_role, user_email
      );
      RAISE EXCEPTION 'ERR_FINE_ROLE_UNAUTHORIZED: HOD can only create fine categories for their own department';
    END IF;
    IF NEW.is_first_year IS NOT NULL AND NEW.is_first_year = true THEN
      PERFORM log_platform_error(
        my_tenant_id, tenant_nm,
        'Fine Category Management',
        'HOD → Fine Category Management → Create Category',
        'ERR_FINE_ROLE_UNAUTHORIZED',
        'CRITICAL',
        'HOD attempted to create a first year fine category. Only the FYC can manage Sem 1 & 2 fine categories.',
        user_role, user_email
      );
      RAISE EXCEPTION 'ERR_FINE_ROLE_UNAUTHORIZED: HOD cannot create first year fine categories. Only FYC can do that.';
    END IF;
    NEW.is_first_year := false;
    RETURN NEW;
  END IF;

  -- ---- STAFF/CLERK RULES ----
  IF user_role IN ('staff', 'clerk') THEN
    IF NEW.department_id != user_dept_id THEN
      RAISE EXCEPTION 'You can only create fine categories for your own department';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ERR_FINE_ROLE_UNAUTHORIZED: Your role cannot manage fine categories';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reattach the trigger (it already exists from 0076, DROP+CREATE is safe)
DROP TRIGGER IF EXISTS trg_fine_category_auth ON attendance_fine_categories;
CREATE TRIGGER trg_fine_category_auth
  BEFORE INSERT OR UPDATE ON attendance_fine_categories
  FOR EACH ROW EXECUTE FUNCTION enforce_fine_category_authorization();

-- ============================================================
-- 5. Update cross-role modification prevention trigger similarly
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_cross_role_fine_modification()
RETURNS TRIGGER AS $$
DECLARE
  user_role      TEXT;
  creator_role   TEXT;
  user_email     TEXT;
  tenant_nm      TEXT;
  my_tenant_id   UUID;
BEGIN
  SELECT p.role, p.tenant_id, p.email
  INTO user_role, my_tenant_id, user_email
  FROM profiles p WHERE p.id = auth.uid();

  SELECT name INTO tenant_nm FROM tenants WHERE id = my_tenant_id;

  -- Admin bypasses
  IF user_role = 'admin' THEN RETURN OLD; END IF;

  -- Get who created this category
  SELECT role INTO creator_role FROM profiles WHERE id = OLD.created_by;

  -- FYC cannot modify HOD-created categories
  IF user_role = 'fyc' AND creator_role = 'hod' THEN
    PERFORM log_platform_error(
      my_tenant_id, tenant_nm,
      'Fine Category Management',
      'FYC → Fine Category Management → Edit/Delete Category',
      'ERR_FINE_ROLE_UNAUTHORIZED',
      'CRITICAL',
      'FYC attempted to modify or delete a fine category created by HOD. Cross-role modification is blocked.',
      user_role, user_email
    );
    RAISE EXCEPTION 'ERR_FINE_ROLE_UNAUTHORIZED: FYC cannot modify HOD-created fine categories';
  END IF;

  -- HOD cannot modify FYC-created categories
  IF user_role = 'hod' AND creator_role = 'fyc' THEN
    PERFORM log_platform_error(
      my_tenant_id, tenant_nm,
      'Fine Category Management',
      'HOD → Fine Category Management → Edit/Delete Category',
      'ERR_FINE_ROLE_UNAUTHORIZED',
      'CRITICAL',
      'HOD attempted to modify or delete a fine category created by FYC. Only FYC can manage first year fine categories.',
      user_role, user_email
    );
    RAISE EXCEPTION 'ERR_FINE_ROLE_UNAUTHORIZED: HOD cannot modify FYC-created fine categories';
  END IF;

  -- Staff/Clerk cannot modify FYC categories
  IF user_role IN ('staff', 'clerk') AND creator_role = 'fyc' THEN
    RAISE EXCEPTION 'Staff/Clerk cannot modify FYC fine categories';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fine_no_cross_modify ON attendance_fine_categories;
CREATE TRIGGER trg_fine_no_cross_modify
  BEFORE UPDATE OR DELETE ON attendance_fine_categories
  FOR EACH ROW EXECUTE FUNCTION prevent_cross_role_fine_modification();
