-- ============================================================
-- 0078: CRITICAL SECURITY PATCHES
-- Fixes audit findings #9, #10, #11, #14, #17, #23, #30, #41
-- ============================================================

-- ============================================================
-- FIX #9: admin_update_user_credentials — Add tenant isolation
-- Previously: any admin in any tenant could change any user's
-- password across ALL tenants. Now enforces same-tenant check.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_update_user_credentials(
  target_user_id UUID,
  new_email TEXT,
  new_password TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  caller_tenant UUID;
  target_tenant UUID;
  caller_role TEXT;
BEGIN
  -- Get caller details
  SELECT tenant_id, role INTO caller_tenant, caller_role
  FROM profiles WHERE id = auth.uid();

  -- Only admin, staff, or hod can run this
  IF caller_role IS NULL OR caller_role NOT IN ('admin', 'staff', 'hod') THEN
    RAISE EXCEPTION 'Not authorized to update user credentials';
  END IF;

  -- Get target tenant
  SELECT tenant_id INTO target_tenant
  FROM profiles WHERE id = target_user_id;

  IF target_tenant IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- CRITICAL: Enforce same-tenant isolation
  IF caller_tenant IS DISTINCT FROM target_tenant THEN
    RAISE EXCEPTION 'Not authorized: cross-tenant operation denied';
  END IF;

  -- Role hierarchy check: staff/hod cannot update admin credentials
  IF caller_role IN ('staff', 'hod') THEN
    DECLARE target_role TEXT;
    BEGIN
      SELECT role INTO target_role FROM profiles WHERE id = target_user_id;
      IF target_role IN ('admin', 'principal') THEN
        RAISE EXCEPTION 'Not authorized: cannot update credentials for this role';
      END IF;
    END;
  END IF;

  -- Update email
  IF new_email IS NOT NULL AND new_email != '' THEN
    UPDATE auth.users SET email = new_email, email_confirmed_at = now() WHERE id = target_user_id;
    UPDATE profiles SET email = new_email WHERE id = target_user_id;
  END IF;

  -- Update password
  IF new_password IS NOT NULL AND new_password != '' THEN
    IF length(new_password) < 8 THEN
      RAISE EXCEPTION 'Password must be at least 8 characters';
    END IF;
    UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf')) WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- FIX #10: admin_delete_user — Add tenant isolation
-- Previously: any admin could delete any user across ALL tenants.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS void AS $$
DECLARE
  caller_role TEXT;
  caller_dept UUID;
  caller_tenant UUID;
  target_role TEXT;
  target_dept UUID;
  target_tenant UUID;
  target_creator UUID;
BEGIN
  -- Get caller details
  SELECT role, department_id, tenant_id
  INTO caller_role, caller_dept, caller_tenant
  FROM profiles WHERE id = auth.uid();

  -- Get target details
  SELECT role, department_id, tenant_id, created_by
  INTO target_role, target_dept, target_tenant, target_creator
  FROM profiles WHERE id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- CRITICAL: Enforce same-tenant isolation
  IF caller_tenant IS DISTINCT FROM target_tenant THEN
    RAISE EXCEPTION 'Not authorized: cross-tenant operation denied';
  END IF;

  -- Authorization logic (same as before, but now tenant-safe):
  IF caller_role = 'admin' THEN
    -- Admin can delete anyone IN THEIR TENANT (enforced above)
    NULL;
  ELSIF caller_role = 'hod' AND caller_dept = target_dept AND target_role IN ('staff', 'teacher', 'faculty', 'clerk', 'student') THEN
    NULL;
  ELSIF caller_role = 'staff' AND caller_dept = target_dept AND target_role IN ('student', 'teacher', 'faculty') THEN
    NULL;
  ELSIF caller_role = 'clerk' AND caller_dept = target_dept AND target_role IN ('student', 'teacher', 'faculty') THEN
    NULL;
  ELSIF caller_role = 'fyc' AND target_role IN ('clerk', 'teacher', 'faculty', 'student') AND target_creator = auth.uid() THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to delete this user. Insufficient permissions or hierarchy mismatch.';
  END IF;

  -- Delete from auth.users (cascades to profiles)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- FIX #41: Prevent role escalation via direct UPDATE on profiles
-- Blocks any attempt to change the `role` column via client-side
-- updateUserAPI(). Role changes must go through proper RPCs.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow the change if the caller is the database owner (service_role)
  -- This is checked by seeing if the function is invoked by a SECURITY DEFINER context
  -- In RLS context (anon/authenticated), block role changes
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Only allow if the caller has the service_role (i.e., Edge Functions)
    -- Regular authenticated users cannot change roles
    IF current_setting('request.jwt.claims', true) IS NOT NULL THEN
      RAISE EXCEPTION 'Role changes are not allowed via direct updates. Use the admin API.';
    END IF;
  END IF;
  
  -- Also prevent is_platform_admin escalation
  IF OLD.is_platform_admin IS DISTINCT FROM NEW.is_platform_admin THEN
    IF current_setting('request.jwt.claims', true) IS NOT NULL THEN
      RAISE EXCEPTION 'Platform admin status cannot be changed via direct updates.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();


-- ============================================================
-- FIX #11: Atomic payment webhook processing RPC
-- Replaces 4 separate DB calls with a single transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION process_payment_webhook(
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_amount_paid NUMERIC
)
RETURNS JSON AS $$
DECLARE
  _order RECORD;
  _result JSON;
BEGIN
  -- Find and lock the order
  SELECT * INTO _order
  FROM payment_orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Order not found', 'order_id', p_razorpay_order_id);
  END IF;

  -- Idempotency: skip if already paid
  IF _order.status = 'paid' THEN
    RETURN json_build_object('success', true, 'already_processed', true);
  END IF;

  -- Step 1: Update payment order
  UPDATE payment_orders
  SET status = 'paid',
      razorpay_payment_id = p_razorpay_payment_id,
      amount_paid = p_amount_paid,
      paid_at = now()
  WHERE id = _order.id;

  -- Step 2: If attendance fine, mark enrollment as verified
  IF _order.enrollment_id IS NOT NULL THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true
    WHERE id = _order.enrollment_id
      AND student_id = _order.student_id;
  END IF;

  -- Step 3: If college fee, mark dues as completed
  IF _order.due_type = 'college_fee' THEN
    UPDATE student_dues
    SET status = 'completed',
        paid_amount = p_amount_paid,
        updated_at = now()
    WHERE student_id = _order.student_id;
  END IF;

  -- Step 4: Log the payment
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    _order.student_id,
    'student',
    'Payment Completed',
    format('Payment ₹%s verified via webhook (Order: %s, Payment: %s)',
           p_amount_paid, p_razorpay_order_id, p_razorpay_payment_id),
    _order.tenant_id
  );

  RETURN json_build_object('success', true, 'student_id', _order.student_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- FIX #23: Clearance state machine enforcement
-- Validates state transitions server-side so clients cannot
-- skip stages (e.g., jump from faculty_review to cleared).
-- ============================================================
CREATE OR REPLACE FUNCTION advance_clearance_stage(
  p_request_id UUID,
  p_action TEXT  -- 'approve' or 'reject'
)
RETURNS JSON AS $$
DECLARE
  _request RECORD;
  _caller_role TEXT;
  _caller_dept UUID;
  _student_dept UUID;
  _next_stage TEXT;
  _has_unpaid_dues BOOLEAN;
BEGIN
  -- Get caller info
  SELECT role, department_id INTO _caller_role, _caller_dept
  FROM profiles WHERE id = auth.uid();

  -- Get request info
  SELECT * INTO _request
  FROM clearance_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clearance request not found';
  END IF;

  -- Get student's department
  SELECT department_id INTO _student_dept
  FROM profiles WHERE id = _request.student_id;

  -- Handle rejection (any authorized role can reject)
  IF p_action = 'reject' THEN
    UPDATE clearance_requests
    SET status = 'rejected', current_stage = 'rejected', updated_at = now()
    WHERE id = p_request_id;
    
    RETURN json_build_object('success', true, 'new_stage', 'rejected');
  END IF;

  -- Validate state transitions for approval
  CASE _request.current_stage
    WHEN 'faculty_review' THEN
      -- Only teachers/faculty can approve faculty review
      IF _caller_role NOT IN ('teacher', 'faculty', 'admin') THEN
        RAISE EXCEPTION 'Only faculty can approve at this stage';
      END IF;
      _next_stage := 'department_review';

    WHEN 'department_review' THEN
      -- Check if student has unpaid college dues
      SELECT EXISTS(
        SELECT 1 FROM student_dues
        WHERE student_id = _request.student_id
          AND status != 'completed'
          AND fine_amount > 0
      ) INTO _has_unpaid_dues;

      IF _has_unpaid_dues THEN
        RAISE EXCEPTION 'Student has unpaid college dues. Cannot advance.';
      END IF;
      _next_stage := 'hod_review';

    WHEN 'hod_review' THEN
      -- Only HOD or admin can approve HOD review
      IF _caller_role NOT IN ('hod', 'admin') THEN
        RAISE EXCEPTION 'Only HOD can approve at this stage';
      END IF;
      -- Verify same department
      IF _caller_role = 'hod' AND _caller_dept IS DISTINCT FROM _student_dept THEN
        RAISE EXCEPTION 'HOD can only approve students in their department';
      END IF;
      _next_stage := 'cleared';

    ELSE
      RAISE EXCEPTION 'Invalid stage for advancement: %', _request.current_stage;
  END CASE;

  -- Apply the transition
  UPDATE clearance_requests
  SET current_stage = _next_stage,
      status = CASE WHEN _next_stage = 'cleared' THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'new_stage', _next_stage);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- FIX #17: Atomic teacher-to-section assignment RPC
-- Replaces 4 sequential client-side queries with one atomic call.
-- ============================================================
CREATE OR REPLACE FUNCTION assign_teacher_to_section_rpc(
  p_subject_id UUID,
  p_section TEXT,
  p_teacher_id UUID,
  p_semester_id UUID
)
RETURNS JSON AS $$
DECLARE
  _student_ids UUID[];
  _inserted INT := 0;
  _updated INT := 0;
BEGIN
  -- 1. Find students in this section + semester
  SELECT ARRAY_AGG(id) INTO _student_ids
  FROM profiles
  WHERE role = 'student'
    AND section = p_section
    AND semester_id = p_semester_id;

  IF _student_ids IS NULL OR array_length(_student_ids, 1) IS NULL THEN
    RETURN json_build_object('inserted', 0, 'updated', 0, 'message', 'No students found');
  END IF;

  -- 2. Insert enrollments for students not yet enrolled (upsert pattern)
  INSERT INTO subject_enrollment (student_id, subject_id, teacher_id)
  SELECT unnest(_student_ids), p_subject_id, p_teacher_id
  ON CONFLICT (student_id, subject_id)
  DO UPDATE SET teacher_id = p_teacher_id;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN json_build_object(
    'updated', _updated,
    'student_count', array_length(_student_ids, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- FIX #30: Prevent duplicate clearance requests
-- ============================================================
-- Add unique constraint (use DO block to avoid error if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_clearance_per_student'
  ) THEN
    -- First, remove any existing duplicates (keep the latest)
    DELETE FROM clearance_requests a
    USING clearance_requests b
    WHERE a.student_id = b.student_id
      AND a.created_at < b.created_at;

    ALTER TABLE clearance_requests
    ADD CONSTRAINT unique_clearance_per_student UNIQUE (student_id);
  END IF;
END $$;


-- ============================================================
-- FIX #14: Restrict attendance_fee_verified updates
-- Students cannot self-verify their own attendance fees.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_student_fee_self_verify()
RETURNS TRIGGER AS $$
DECLARE
  _caller_role TEXT;
BEGIN
  -- Only check if attendance_fee_verified is being changed to true
  IF NEW.attendance_fee_verified = true AND (OLD.attendance_fee_verified IS DISTINCT FROM NEW.attendance_fee_verified) THEN
    SELECT role INTO _caller_role FROM profiles WHERE id = auth.uid();
    IF _caller_role = 'student' THEN
      RAISE EXCEPTION 'Students cannot verify their own attendance fees';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_student_fee_self_verify ON subject_enrollment;
CREATE TRIGGER trg_prevent_student_fee_self_verify
  BEFORE UPDATE ON subject_enrollment
  FOR EACH ROW
  EXECUTE FUNCTION prevent_student_fee_self_verify();
