-- =============================================================
-- 0081: Atomic payment order creation — prevents double-spend
-- =============================================================
-- Previously, amount verification and order insertion happened
-- in separate statements in the Edge Function with no lock.
-- Two simultaneous requests could both pass verification and
-- create duplicate orders for the same fine.
--
-- This RPC locks the enrollment row with FOR UPDATE, verifies
-- the amount matches, checks no existing order exists, and
-- inserts atomically — all in a single transaction.
-- =============================================================

CREATE OR REPLACE FUNCTION create_payment_order_atomic(
  p_student_id UUID,
  p_enrollment_id UUID,
  p_amount NUMERIC(10,2),
  p_due_type TEXT,
  p_razorpay_order_id TEXT,
  p_tenant_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_enrollment RECORD;
  v_existing_order RECORD;
BEGIN
  -- 1. Check for existing unpaid order for this enrollment (idempotency)
  IF p_enrollment_id IS NOT NULL AND (p_due_type IS NULL OR p_due_type = 'attendance_fine') THEN
    SELECT id INTO v_existing_order
    FROM payment_orders
    WHERE enrollment_id = p_enrollment_id
      AND student_id = p_student_id
      AND status = 'created'
    LIMIT 1;

    IF v_existing_order.id IS NOT NULL THEN
      RAISE EXCEPTION 'An unpaid order already exists for this enrollment'
        USING ERRCODE = 'unique_violation';
    END IF;

    -- 2. Lock the enrollment row to prevent concurrent modifications
    SELECT attendance_fee, attendance_fee_verified
    INTO v_enrollment
    FROM subject_enrollment
    WHERE id = p_enrollment_id
      AND student_id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Enrollment not found or does not belong to student'
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_enrollment.attendance_fee_verified THEN
      RAISE EXCEPTION 'This fine has already been paid'
        USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Verify amount matches actual fine
    IF ABS(p_amount - v_enrollment.attendance_fee) > 0.01 THEN
      RAISE EXCEPTION 'Amount % does not match fine %', p_amount, v_enrollment.attendance_fee
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF p_due_type = 'college_fee' THEN
    -- For college fees, verify total outstanding dues
    DECLARE
      v_total_due NUMERIC(10,2);
    BEGIN
      SELECT COALESCE(SUM(fine_amount - COALESCE(paid_amount, 0)), 0)
      INTO v_total_due
      FROM student_dues
      WHERE student_id = p_student_id
        AND status = 'pending'
      FOR UPDATE;  -- Lock dues rows too

      IF v_total_due <= 0 THEN
        RAISE EXCEPTION 'No pending dues found'
          USING ERRCODE = 'no_data_found';
      END IF;

      IF ABS(p_amount - v_total_due) > 0.01 THEN
        RAISE EXCEPTION 'Amount % does not match outstanding dues %', p_amount, v_total_due
          USING ERRCODE = 'check_violation';
      END IF;
    END;
  END IF;

  -- 4. Insert the payment order atomically
  INSERT INTO payment_orders (
    razorpay_order_id,
    student_id,
    enrollment_id,
    due_type,
    amount,
    status,
    tenant_id
  ) VALUES (
    p_razorpay_order_id,
    p_student_id,
    p_enrollment_id,
    COALESCE(p_due_type, 'attendance_fine'),
    p_amount,
    'created',
    p_tenant_id
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

-- Grant execute to authenticated users (Edge Function calls via service_role)
GRANT EXECUTE ON FUNCTION create_payment_order_atomic TO service_role;
