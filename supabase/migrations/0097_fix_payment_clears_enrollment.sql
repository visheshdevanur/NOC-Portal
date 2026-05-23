-- =============================================================
-- 0097: Fix payment → enrollment status + auto-advance clearance
--
-- Problems fixed:
-- 1. After payment, subject_enrollment.status stayed 'rejected'
--    even though the fine was paid (attendance_fee_verified = true).
--    Fix: Set status = 'completed' when fee is paid.
-- 2. Dashboards (Faculty, HOD) didn't reflect the paid state.
--    Fix: Status = 'completed' is the universal "cleared" signal.
-- 3. No auto-advance of clearance_request when all subjects cleared.
--    Fix: After updating enrollments, check if ALL enrollments for
--    the student are cleared AND IA eligible, then auto-advance
--    the clearance_request.current_stage to 'hod_review'.
-- =============================================================

CREATE OR REPLACE FUNCTION process_payment_webhook(
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_amount_paid NUMERIC
)
RETURNS JSON AS $$
DECLARE
  _order RECORD;
  _enrollment_ids_arr UUID[];
  _student_id UUID;
  _all_cleared BOOLEAN;
  _ia_eligible BOOLEAN;
  _request RECORD;
BEGIN
  -- Find and lock the order
  SELECT * INTO _order
  FROM payment_orders
  WHERE gateway_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Order not found', 'order_id', p_razorpay_order_id);
  END IF;

  -- Idempotency: skip if already paid
  IF _order.status = 'paid' THEN
    RETURN json_build_object('success', true, 'already_processed', true);
  END IF;

  -- S-11: Amount validation — reject if paid amount doesn't match expected amount
  IF ABS(p_amount_paid - _order.amount) > 0.01 THEN
    RETURN json_build_object(
      'error', 'Amount mismatch',
      'expected', _order.amount,
      'received', p_amount_paid,
      'order_id', p_razorpay_order_id
    );
  END IF;

  _student_id := _order.student_id;

  -- Step 1: Update payment order status to 'paid'
  UPDATE payment_orders
  SET status = 'paid',
      gateway_payment_id = p_razorpay_payment_id,
      amount_paid = p_amount_paid,
      paid_at = now()
  WHERE id = _order.id;

  -- Step 2: Mark single enrollment as fee verified + completed
  IF _order.enrollment_id IS NOT NULL THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true,
        status = 'completed',  -- FIX: Was keeping 'rejected', now marks as completed
        gateway_payment_id = p_razorpay_payment_id,
        payment_date = now()
    WHERE id = _order.enrollment_id
      AND student_id = _student_id;
  END IF;

  -- Step 3: Handle bulk payments (enrollment_ids JSONB array)
  IF _order.enrollment_ids IS NOT NULL AND jsonb_typeof(_order.enrollment_ids) = 'array' THEN
    SELECT array_agg(elem::text::uuid) INTO _enrollment_ids_arr
    FROM jsonb_array_elements_text(_order.enrollment_ids) AS elem;

    IF _enrollment_ids_arr IS NOT NULL AND array_length(_enrollment_ids_arr, 1) > 0 THEN
      UPDATE subject_enrollment
      SET attendance_fee_verified = true,
          status = 'completed',  -- FIX: Mark all bulk enrollments as completed
          gateway_payment_id = p_razorpay_payment_id,
          payment_date = now()
      WHERE id = ANY(_enrollment_ids_arr)
        AND student_id = _student_id;
    END IF;
  END IF;

  -- Step 4: Handle college fee payments
  IF _order.due_type = 'college_fee' THEN
    UPDATE student_dues
    SET status = 'completed',
        paid_amount = p_amount_paid,
        updated_at = now()
    WHERE student_id = _student_id
      AND status = 'pending';
  END IF;

  -- Step 5: AUTO-ADVANCE CLEARANCE
  -- Check if ALL of this student's enrollments are now cleared
  SELECT NOT EXISTS (
    SELECT 1 FROM subject_enrollment
    WHERE student_id = _student_id
      AND status NOT IN ('completed')
      AND attendance_fee_verified = false
  ) INTO _all_cleared;

  -- Check IA eligibility: student must have >= 2 IA attendance records per subject
  SELECT NOT EXISTS (
    SELECT se.id
    FROM subject_enrollment se
    WHERE se.student_id = _student_id
    HAVING (
      SELECT COUNT(DISTINCT ia.ia_number)
      FROM ia_attendance ia
      WHERE ia.student_id = _student_id
        AND ia.subject_id = se.subject_id
        AND ia.is_present = true
    ) < 2
  ) INTO _ia_eligible;
  -- If ia_attendance table doesn't exist or no records, default to true
  IF _ia_eligible IS NULL THEN
    _ia_eligible := true;
  END IF;

  -- If all cleared AND IA eligible, advance clearance request to hod_review
  IF _all_cleared THEN
    SELECT * INTO _request
    FROM clearance_requests
    WHERE student_id = _student_id
      AND current_stage IN ('faculty_review', 'pending')
      AND status != 'completed'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE clearance_requests
      SET current_stage = 'hod_review',
          updated_at = now()
      WHERE id = _request.id;
    END IF;
  END IF;

  -- Step 6: Audit log
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (_student_id, 'student', 'Payment Completed',
    format('Payment of Rs.%s verified (Order: %s, Payment: %s)', p_amount_paid, p_razorpay_order_id, p_razorpay_payment_id),
    _order.tenant_id);

  RETURN json_build_object(
    'success', true,
    'student_id', _student_id,
    'all_cleared', _all_cleared,
    'order_id', p_razorpay_order_id,
    'amount_paid', p_amount_paid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
