-- =============================================================
-- COMBINED FIX: New students work exactly like old students
-- Run this ONCE in Supabase SQL Editor
-- =============================================================

-- =============================================
-- 1. RPC: Accounts upsert (handles ALL fields)
-- =============================================
CREATE OR REPLACE FUNCTION rpc_upsert_student_due(
  p_student_id UUID,
  p_updates JSONB
)
RETURNS VOID AS $$
DECLARE
  _caller_role TEXT;
  _caller_tenant UUID;
  _existing_id UUID;
BEGIN
  SELECT role, tenant_id INTO _caller_role, _caller_tenant
  FROM profiles WHERE id = auth.uid();

  IF _caller_role NOT IN ('accounts', 'librarian', 'admin', 'hod', 'staff', 'clerk', 'fyc', 'principal', 'teacher', 'faculty') THEN
    RAISE EXCEPTION 'Unauthorized: role % cannot update student dues', _caller_role;
  END IF;

  SELECT id INTO _existing_id FROM student_dues WHERE student_id = p_student_id;

  IF _existing_id IS NOT NULL THEN
    UPDATE student_dues SET
      fine_amount     = COALESCE((p_updates->>'fine_amount')::NUMERIC, fine_amount),
      paid_amount     = COALESCE((p_updates->>'paid_amount')::NUMERIC, paid_amount),
      status          = COALESCE(p_updates->>'status', status),
      permitted_until = CASE
                          WHEN p_updates ? 'permitted_until' THEN (p_updates->>'permitted_until')::TIMESTAMPTZ
                          ELSE permitted_until
                        END,
      updated_at = now()
    WHERE id = _existing_id;
  ELSE
    INSERT INTO student_dues (student_id, tenant_id, fine_amount, paid_amount, status, permitted_until, updated_at)
    VALUES (
      p_student_id,
      _caller_tenant,
      COALESCE((p_updates->>'fine_amount')::NUMERIC, 0),
      COALESCE((p_updates->>'paid_amount')::NUMERIC, 0),
      COALESCE(p_updates->>'status', 'pending'),
      (p_updates->>'permitted_until')::TIMESTAMPTZ,
      now()
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- 2. RPC: Library upsert (handles ALL fields)
-- =============================================
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

-- =============================================
-- 3. Trigger: Auto-create BOTH dues rows for
--    every new student (with tenant_id)
-- =============================================
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

-- =============================================
-- 4. Backfill: Create missing rows for ALL
--    existing students who don't have them yet
-- =============================================
INSERT INTO student_dues (student_id, tenant_id)
SELECT p.id, p.tenant_id FROM profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM student_dues sd WHERE sd.student_id = p.id)
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO library_dues (student_id, tenant_id)
SELECT p.id, p.tenant_id FROM profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM library_dues ld WHERE ld.student_id = p.id)
ON CONFLICT (student_id) DO NOTHING;

-- =============================================
-- 5. Fix any existing rows with NULL tenant_id
-- =============================================
UPDATE student_dues sd SET tenant_id = p.tenant_id
FROM profiles p
WHERE sd.student_id = p.id AND sd.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

UPDATE library_dues ld SET tenant_id = p.tenant_id
FROM profiles p
WHERE ld.student_id = p.id AND ld.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
