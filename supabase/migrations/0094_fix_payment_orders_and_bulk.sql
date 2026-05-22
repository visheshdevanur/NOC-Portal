-- 1. Add 'expired' to payment_orders status check constraint
ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_status_check 
  CHECK (status IN ('created', 'paid', 'failed', 'expired'));

-- 2. Expire all stale orders
UPDATE payment_orders SET status = 'expired' 
WHERE status = 'created' AND created_at < now() - interval '30 minutes';

-- 3. Add enrollment_ids column for bulk payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'enrollment_ids'
  ) THEN
    ALTER TABLE payment_orders ADD COLUMN enrollment_ids JSONB;
  END IF;
END $$;

-- 4. Update process_payment_webhook for bulk clearing
CREATE OR REPLACE FUNCTION process_payment_webhook(
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_amount_paid NUMERIC
)
RETURNS JSON AS $$
DECLARE
  _order RECORD;
  _enrollment_ids_arr UUID[];
BEGIN
  SELECT * INTO _order FROM payment_orders
  WHERE gateway_order_id = p_razorpay_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Order not found', 'order_id', p_razorpay_order_id);
  END IF;

  IF _order.status = 'paid' THEN
    RETURN json_build_object('success', true, 'already_processed', true);
  END IF;

  UPDATE payment_orders
  SET status = 'paid', gateway_payment_id = p_razorpay_payment_id,
      amount_paid = p_amount_paid, paid_at = now()
  WHERE id = _order.id;

  -- Clear single enrollment
  IF _order.enrollment_id IS NOT NULL THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true, gateway_payment_id = p_razorpay_payment_id, payment_date = now()
    WHERE id = _order.enrollment_id AND student_id = _order.student_id;
  END IF;

  -- Clear bulk enrollments
  IF _order.enrollment_ids IS NOT NULL AND jsonb_typeof(_order.enrollment_ids) = 'array' THEN
    SELECT array_agg(elem::text::uuid) INTO _enrollment_ids_arr
    FROM jsonb_array_elements_text(_order.enrollment_ids) AS elem;

    IF _enrollment_ids_arr IS NOT NULL AND array_length(_enrollment_ids_arr, 1) > 0 THEN
      UPDATE subject_enrollment
      SET attendance_fee_verified = true, gateway_payment_id = p_razorpay_payment_id, payment_date = now()
      WHERE id = ANY(_enrollment_ids_arr) AND student_id = _order.student_id;
    END IF;
  END IF;

  -- Clear college dues
  IF _order.due_type = 'college_fee' THEN
    UPDATE student_dues SET status = 'completed', paid_amount = p_amount_paid, updated_at = now()
    WHERE student_id = _order.student_id;
  END IF;

  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (_order.student_id, 'student', 'Payment Completed',
    format('Payment of Rs.%s verified (Order: %s, Payment: %s)', p_amount_paid, p_razorpay_order_id, p_razorpay_payment_id),
    _order.tenant_id);

  RETURN json_build_object('success', true, 'student_id', _order.student_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Update create_payment_order_atomic to auto-expire stale orders and handle bulk
CREATE OR REPLACE FUNCTION create_payment_order_atomic(
  p_student_id UUID,
  p_enrollment_id UUID,
  p_amount NUMERIC(10,2),
  p_due_type TEXT,
  p_gateway_order_id TEXT,
  p_tenant_id UUID,
  p_gateway_type TEXT DEFAULT 'hdfc',
  p_payment_link TEXT DEFAULT NULL
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
  -- Auto-expire stale orders (older than 30 minutes)
  UPDATE payment_orders
  SET status = 'expired'
  WHERE student_id = p_student_id
    AND status = 'created'
    AND created_at < now() - interval '30 minutes';

  -- 1. Check for existing unpaid order for this enrollment
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

    SELECT attendance_fee, attendance_fee_verified
    INTO v_enrollment
    FROM subject_enrollment
    WHERE id = p_enrollment_id AND student_id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Enrollment not found or does not belong to student'
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_enrollment.attendance_fee_verified THEN
      RAISE EXCEPTION 'This fine has already been paid'
        USING ERRCODE = 'check_violation';
    END IF;

    IF ABS(p_amount - v_enrollment.attendance_fee) > 0.01 THEN
      RAISE EXCEPTION 'Amount % does not match fine %', p_amount, v_enrollment.attendance_fee
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF p_due_type = 'attendance_fine_bulk' THEN
    -- For bulk payments, skip individual enrollment validation
    NULL;

  ELSIF p_due_type = 'college_fee' THEN
    DECLARE
      v_total_due NUMERIC(10,2);
    BEGIN
      SELECT COALESCE(SUM(fine_amount - COALESCE(paid_amount, 0)), 0)
      INTO v_total_due
      FROM student_dues
      WHERE student_id = p_student_id AND status = 'pending'
      FOR UPDATE;

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

  INSERT INTO payment_orders (
    gateway_order_id, student_id, enrollment_id, due_type,
    amount, status, tenant_id, gateway_type, payment_link
  ) VALUES (
    p_gateway_order_id, p_student_id, p_enrollment_id,
    COALESCE(p_due_type, 'attendance_fine'),
    p_amount, 'created', p_tenant_id,
    COALESCE(p_gateway_type, 'hdfc'), p_payment_link
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;
