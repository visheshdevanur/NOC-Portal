-- =============================================================
-- 0100: Fix role names in RPCs
-- The library role is 'librarian' not 'library'.
-- Both RPCs need ALL staff roles to work cross-dashboard.
-- =============================================================

-- Fix student_dues RPC: add 'librarian'
CREATE OR REPLACE FUNCTION rpc_upsert_student_due(
  p_student_id UUID,
  p_updates JSONB
)
RETURNS VOID AS $$
DECLARE
  _caller_role TEXT;
  _caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO _caller_role, _caller_tenant
  FROM profiles WHERE id = auth.uid();

  IF _caller_role NOT IN ('accounts', 'librarian', 'admin', 'hod', 'staff', 'clerk', 'fyc', 'principal', 'teacher', 'faculty') THEN
    RAISE EXCEPTION 'Unauthorized: role % cannot update student dues', _caller_role;
  END IF;

  INSERT INTO student_dues (student_id, tenant_id,
    fine_amount, paid_amount, status, updated_at)
  VALUES (
    p_student_id,
    _caller_tenant,
    COALESCE((p_updates->>'fine_amount')::NUMERIC, 0),
    COALESCE((p_updates->>'paid_amount')::NUMERIC, 0),
    COALESCE(p_updates->>'status', 'pending'),
    now()
  )
  ON CONFLICT (student_id) DO UPDATE SET
    fine_amount = COALESCE((p_updates->>'fine_amount')::NUMERIC, student_dues.fine_amount),
    paid_amount = COALESCE((p_updates->>'paid_amount')::NUMERIC, student_dues.paid_amount),
    status = COALESCE(p_updates->>'status', student_dues.status),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix library_dues RPC: 'librarian' not 'library', add 'accounts'
CREATE OR REPLACE FUNCTION rpc_upsert_library_due(
  p_student_id UUID,
  p_has_dues BOOLEAN,
  p_fine_amount NUMERIC DEFAULT 0,
  p_paid_amount NUMERIC DEFAULT 0,
  p_remarks TEXT DEFAULT NULL,
  p_permitted BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
DECLARE
  _caller_role TEXT;
  _caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO _caller_role, _caller_tenant
  FROM profiles WHERE id = auth.uid();

  IF _caller_role NOT IN ('librarian', 'accounts', 'admin', 'hod', 'staff', 'clerk', 'fyc', 'principal', 'teacher', 'faculty') THEN
    RAISE EXCEPTION 'Unauthorized: role % cannot update library dues', _caller_role;
  END IF;

  INSERT INTO library_dues (student_id, tenant_id, has_dues, fine_amount, paid_amount, remarks, permitted, updated_at)
  VALUES (p_student_id, _caller_tenant, p_has_dues, p_fine_amount, p_paid_amount, p_remarks, p_permitted, now())
  ON CONFLICT (student_id) DO UPDATE SET
    has_dues = p_has_dues,
    fine_amount = p_fine_amount,
    paid_amount = p_paid_amount,
    remarks = p_remarks,
    permitted = p_permitted,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
