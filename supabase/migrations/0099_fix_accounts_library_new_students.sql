-- =============================================================
-- 0099: Fix accounts/library dues for new students
--
-- Problem: Accounts staff can't upsert into student_dues because
-- the RESTRICTIVE tenant_isolation policy blocks inserts when
-- tenant_id isn't set yet (trigger runs AFTER policy check).
--
-- Fix: Create SECURITY DEFINER RPCs that bypass RLS for
-- accounts and library staff operations.
-- =============================================================

-- 1. RPC for accounts to upsert student dues (bypasses RLS)
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

  IF _caller_role NOT IN ('accounts', 'admin', 'hod', 'staff', 'clerk', 'fyc') THEN
    RAISE EXCEPTION 'Unauthorized: only staff roles can update dues';
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

-- 2. RPC for library staff to upsert library dues (bypasses RLS)
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

  IF _caller_role NOT IN ('library', 'admin', 'hod', 'staff', 'clerk', 'fyc') THEN
    RAISE EXCEPTION 'Unauthorized: only staff roles can update library dues';
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

-- 3. Ensure new students automatically get student_dues and library_dues rows
-- Update the existing trigger to also create library_dues
CREATE OR REPLACE FUNCTION trg_setup_student_dues()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'student' THEN
    INSERT INTO student_dues (student_id, tenant_id)
    VALUES (NEW.id, NEW.tenant_id)
    ON CONFLICT (student_id) DO NOTHING;

    INSERT INTO library_dues (student_id, tenant_id)
    VALUES (NEW.id, NEW.tenant_id)
    ON CONFLICT (student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Backfill: create missing student_dues rows for existing students
INSERT INTO student_dues (student_id, tenant_id)
SELECT p.id, p.tenant_id FROM profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM student_dues sd WHERE sd.student_id = p.id)
ON CONFLICT (student_id) DO NOTHING;

-- 5. Backfill: create missing library_dues rows for existing students
INSERT INTO library_dues (student_id, tenant_id)
SELECT p.id, p.tenant_id FROM profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM library_dues ld WHERE ld.student_id = p.id)
ON CONFLICT (student_id) DO NOTHING;
