-- =============================================================
-- 0097: Fix payment → enrollment status + auto-advance clearance
--
-- ROOT CAUSE: Migration 0095 introduced a REGRESSION in the
-- process_payment_webhook RPC. It used the OLD column name
-- `razorpay_payment_id` which was RENAMED to `gateway_payment_id`
-- in migration 0091. This caused the ENTIRE RPC to crash at
-- runtime, meaning:
--   - payment_orders.status stayed 'created' (never became 'paid')
--   - subject_enrollment was NEVER updated
--   - Frontend showed "CHARGED" (from HDFC API) but DB was unchanged
--
-- Additional fixes:
-- 1. Set enrollment status='completed' after payment (was 'rejected')
-- 2. Auto-advance clearance_request to hod_review when all cleared
-- =============================================================

-- Step 1: Add tracking columns to subject_enrollment (if missing)
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT;
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;

-- Step 2: Recreate the RPC with CORRECT column names
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

  -- Amount validation (S-11) — allow ₹0.01 tolerance for rounding
  IF ABS(p_amount_paid - _order.amount) > 0.01 THEN
    RETURN json_build_object(
      'error', 'Amount mismatch',
      'expected', _order.amount,
      'received', p_amount_paid,
      'order_id', p_razorpay_order_id
    );
  END IF;

  _student_id := _order.student_id;

  -- ═══════════════════════════════════════════════════════════
  -- Step 1: Update payment order → 'paid'
  -- FIX: Use gateway_payment_id (NOT razorpay_payment_id)
  -- ═══════════════════════════════════════════════════════════
  UPDATE payment_orders
  SET status = 'paid',
      gateway_payment_id = p_razorpay_payment_id,
      amount_paid = p_amount_paid,
      paid_at = now()
  WHERE id = _order.id;

  -- ═══════════════════════════════════════════════════════════
  -- Step 2: Mark single enrollment as COMPLETED + fee verified
  -- FIX: Was keeping status='rejected', now sets 'completed'
  -- ═══════════════════════════════════════════════════════════
  IF _order.enrollment_id IS NOT NULL THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true,
        status = 'completed',
        gateway_payment_id = p_razorpay_payment_id,
        payment_date = now()
    WHERE id = _order.enrollment_id
      AND student_id = _student_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- Step 3: Handle BULK payments (Pay All)
  -- ═══════════════════════════════════════════════════════════
  IF _order.enrollment_ids IS NOT NULL AND jsonb_typeof(_order.enrollment_ids) = 'array' THEN
    SELECT array_agg(elem::text::uuid) INTO _enrollment_ids_arr
    FROM jsonb_array_elements_text(_order.enrollment_ids) AS elem;

    IF _enrollment_ids_arr IS NOT NULL AND array_length(_enrollment_ids_arr, 1) > 0 THEN
      UPDATE subject_enrollment
      SET attendance_fee_verified = true,
          status = 'completed',
          gateway_payment_id = p_razorpay_payment_id,
          payment_date = now()
      WHERE id = ANY(_enrollment_ids_arr)
        AND student_id = _student_id;
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- Step 4: Handle college fee payments
  -- ═══════════════════════════════════════════════════════════
  IF _order.due_type = 'college_fee' THEN
    UPDATE student_dues
    SET status = 'completed',
        paid_amount = p_amount_paid,
        updated_at = now()
    WHERE student_id = _student_id
      AND status = 'pending';
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- Step 5: AUTO-ADVANCE clearance if ALL subjects cleared
  -- ═══════════════════════════════════════════════════════════
  SELECT NOT EXISTS (
    SELECT 1 FROM subject_enrollment
    WHERE student_id = _student_id
      AND status != 'completed'
  ) INTO _all_cleared;

  IF _all_cleared THEN
    SELECT * INTO _request
    FROM clearance_requests
    WHERE student_id = _student_id
      AND current_stage IN ('faculty_review', 'student_application')
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

  -- ═══════════════════════════════════════════════════════════
  -- Step 6: Audit log
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (_student_id, 'student', 'Payment Completed',
    format('Payment of Rs.%s verified (Order: %s, Txn: %s)', p_amount_paid, p_razorpay_order_id, p_razorpay_payment_id),
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

-- ═══════════════════════════════════════════════════════════
-- Step 3: Fix any orders that were "CHARGED" by HDFC but
-- never updated in our DB due to the 0095 column name bug.
-- These orders have status='created' but HDFC already charged them.
-- We can't auto-fix these (we don't know if HDFC actually charged),
-- but we mark them for manual review.
-- ═══════════════════════════════════════════════════════════
-- (No auto-fix — admin should verify with HDFC dashboard and
--  manually update via Supabase if needed)
