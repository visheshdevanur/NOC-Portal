-- =============================================================
-- 0101: Fix student_dues RPC to handle permitted_until + paid_amount
-- The RPC was silently dropping permitted_until, so Permit action
-- appeared to succeed but didn't actually update the column.
-- =============================================================

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

  -- Check if row exists
  SELECT id INTO _existing_id FROM student_dues WHERE student_id = p_student_id;

  IF _existing_id IS NOT NULL THEN
    -- Row exists: do a targeted UPDATE only on fields present in p_updates
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
    -- No row: INSERT with defaults
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
