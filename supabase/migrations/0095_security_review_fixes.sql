-- =============================================================
-- 0095: Security Review Fixes
-- S-7:  Tenant isolation for imported_teachers
-- S-11: Amount validation in process_payment_webhook RPC
-- IDOR: Add order_token column to payment_orders
-- =============================================================

-- =============================================================
-- S-7: Add RESTRICTIVE tenant isolation policy to imported_teachers
-- Without this, teachers imported in Tenant A could be visible to Tenant B.
-- =============================================================
DO $$ BEGIN
  -- Only add if the table exists and has a tenant_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imported_teachers' AND column_name = 'tenant_id'
  ) THEN
    -- Drop existing policy if any
    DROP POLICY IF EXISTS "tenant_isolation_imported_teachers" ON imported_teachers;
    
    -- Create RESTRICTIVE tenant isolation policy (AND'd with existing permissive policies)
    CREATE POLICY "tenant_isolation_imported_teachers" ON imported_teachers
      AS RESTRICTIVE FOR ALL
      USING (tenant_id = get_my_tenant_id());
  END IF;
END $$;


-- =============================================================
-- IDOR Protection: Add order_token column to payment_orders
-- Used in callback mode to verify the caller actually initiated the payment.
-- The token is a 48-char hex string stored alongside the order_id.
-- =============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'order_token'
  ) THEN
    ALTER TABLE payment_orders ADD COLUMN order_token TEXT;
  END IF;
END $$;


-- =============================================================
-- S-11: Add amount validation to process_payment_webhook RPC
-- Ensures the amount paid matches the expected order amount.
-- A compromised webhook cannot mark an order as paid with ₹0.
-- =============================================================
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
  -- Allow a small tolerance (₹0.01) for rounding differences
  IF ABS(p_amount_paid - _order.amount) > 0.01 THEN
    RETURN json_build_object(
      'error', 'Amount mismatch',
      'expected', _order.amount,
      'received', p_amount_paid,
      'order_id', p_razorpay_order_id
    );
  END IF;

  -- Step 1: Update payment order
  UPDATE payment_orders
  SET status = 'paid',
      razorpay_payment_id = p_razorpay_payment_id,
      amount_paid = p_amount_paid,
      paid_at = now()
  WHERE id = _order.id;

  -- Step 2: Mark enrollment as fee verified
  IF _order.enrollment_id IS NOT NULL THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true,
        status = CASE WHEN status = 'rejected' THEN 'rejected' ELSE status END
    WHERE id = _order.enrollment_id;
  END IF;

  -- Step 3: Handle bulk payments (enrollment_ids JSONB array)
  IF _order.enrollment_ids IS NOT NULL AND jsonb_array_length(_order.enrollment_ids) > 0 THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true
    WHERE id = ANY(
      SELECT (jsonb_array_elements_text(_order.enrollment_ids))::UUID
    );
  END IF;

  -- Step 4: Handle college fee payments
  IF _order.due_type = 'college_fee' THEN
    UPDATE student_dues
    SET status = 'completed',
        paid_amount = fine_amount
    WHERE student_id = _order.student_id
      AND status = 'pending';
  END IF;

  RETURN json_build_object(
    'success', true,
    'order_id', p_razorpay_order_id,
    'amount_paid', p_amount_paid,
    'enrollment_id', _order.enrollment_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
