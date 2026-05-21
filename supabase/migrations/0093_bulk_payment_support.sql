-- =============================================================
-- 0093: Bulk Payment Support & Fine Clearing
-- Adds enrollment_ids JSONB column for bulk payment tracking
-- Updates process_payment_webhook to clear ALL bulk enrollments
-- =============================================================

-- Step 1: Add enrollment_ids column for bulk payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'enrollment_ids'
  ) THEN
    ALTER TABLE payment_orders ADD COLUMN enrollment_ids JSONB;
  END IF;
END $$;

-- Step 2: Update process_payment_webhook to handle bulk enrollment clearing
CREATE OR REPLACE FUNCTION process_payment_webhook(
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_amount_paid NUMERIC
)
RETURNS JSON AS $$
DECLARE
  _order RECORD;
  _enrollment_id UUID;
  _enrollment_ids_arr UUID[];
BEGIN
  SELECT * INTO _order
  FROM payment_orders
  WHERE gateway_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Order not found', 'order_id', p_razorpay_order_id);
  END IF;

  IF _order.status = 'paid' THEN
    RETURN json_build_object('success', true, 'already_processed', true);
  END IF;

  -- Mark order as paid
  UPDATE payment_orders
  SET status = 'paid',
      gateway_payment_id = p_razorpay_payment_id,
      amount_paid = p_amount_paid,
      paid_at = now()
  WHERE id = _order.id;

  -- Handle single enrollment payment
  IF _order.enrollment_id IS NOT NULL THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true,
        gateway_payment_id = p_razorpay_payment_id,
        payment_date = now()
    WHERE id = _order.enrollment_id
      AND student_id = _order.student_id;
  END IF;

  -- Handle bulk enrollment payment (clear ALL enrollments)
  IF _order.enrollment_ids IS NOT NULL AND jsonb_typeof(_order.enrollment_ids) = 'array' THEN
    -- Convert JSONB array to UUID array
    SELECT array_agg(elem::text::uuid)
    INTO _enrollment_ids_arr
    FROM jsonb_array_elements_text(_order.enrollment_ids) AS elem;

    IF _enrollment_ids_arr IS NOT NULL AND array_length(_enrollment_ids_arr, 1) > 0 THEN
      UPDATE subject_enrollment
      SET attendance_fee_verified = true,
          gateway_payment_id = p_razorpay_payment_id,
          payment_date = now()
      WHERE id = ANY(_enrollment_ids_arr)
        AND student_id = _order.student_id;
    END IF;
  END IF;

  -- Handle college fee payment
  IF _order.due_type = 'college_fee' THEN
    UPDATE student_dues
    SET status = 'completed',
        paid_amount = p_amount_paid,
        updated_at = now()
    WHERE student_id = _order.student_id;
  END IF;

  -- Log the payment
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    _order.student_id, 'student', 'Payment Completed',
    format('Payment of Rs.%s verified via %s (Order: %s, Payment: %s)',
           p_amount_paid, _order.gateway_type, p_razorpay_order_id, p_razorpay_payment_id),
    _order.tenant_id
  );

  RETURN json_build_object('success', true, 'student_id', _order.student_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
