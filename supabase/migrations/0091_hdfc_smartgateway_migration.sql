-- =============================================================
-- 0091: HDFC SmartGateway Migration
-- Creates payment_orders table (if not exists) with HDFC-ready
-- column names, renames any existing Razorpay columns, and
-- updates all atomic RPCs for the new payment flow.
-- =============================================================

-- ─── Step 1: Create payment_orders if it doesn't exist (HDFC-ready) ───
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_order_id TEXT NOT NULL UNIQUE,
  gateway_payment_id TEXT,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES subject_enrollment(id),
  due_type TEXT NOT NULL DEFAULT 'attendance_fine' CHECK (due_type IN ('attendance_fine', 'attendance_fine_bulk', 'college_fee', 'library_fine')),
  amount NUMERIC(10,2) NOT NULL,
  amount_paid NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  gateway_type TEXT NOT NULL DEFAULT 'hdfc' CHECK (gateway_type IN ('razorpay', 'hdfc')),
  payment_link TEXT,
  tenant_id UUID REFERENCES tenants(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Step 2: If table existed with old Razorpay columns, rename them ───
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'razorpay_order_id'
  ) THEN
    ALTER TABLE payment_orders RENAME COLUMN razorpay_order_id TO gateway_order_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'razorpay_payment_id'
  ) THEN
    ALTER TABLE payment_orders RENAME COLUMN razorpay_payment_id TO gateway_payment_id;
  END IF;

  -- Add new columns if they don't exist (for tables created before this migration)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'gateway_type'
  ) THEN
    ALTER TABLE payment_orders ADD COLUMN gateway_type TEXT NOT NULL DEFAULT 'hdfc'
      CHECK (gateway_type IN ('razorpay', 'hdfc'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'payment_link'
  ) THEN
    ALTER TABLE payment_orders ADD COLUMN payment_link TEXT;
  END IF;
END $$;

-- ─── Step 3: Indexes ───
CREATE INDEX IF NOT EXISTS idx_payment_orders_gateway_order ON payment_orders(gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_student ON payment_orders(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_tenant ON payment_orders(tenant_id);

-- Drop old index name if it exists
DROP INDEX IF EXISTS idx_payment_orders_razorpay_order;

-- ─── Step 4: RLS ───
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_orders' AND policyname = 'Students can view own orders') THEN
    CREATE POLICY "Students can view own orders" ON payment_orders FOR SELECT USING (auth.uid() = student_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_orders' AND policyname = 'Service role can manage all orders') THEN
    CREATE POLICY "Service role can manage all orders" ON payment_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── Step 5: Rename columns in subject_enrollment (if old names exist) ───
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_enrollment' AND column_name = 'razorpay_order_id'
  ) THEN
    ALTER TABLE subject_enrollment RENAME COLUMN razorpay_order_id TO gateway_order_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_enrollment' AND column_name = 'razorpay_payment_id'
  ) THEN
    ALTER TABLE subject_enrollment RENAME COLUMN razorpay_payment_id TO gateway_payment_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_enrollment' AND column_name = 'razorpay_signature'
  ) THEN
    ALTER TABLE subject_enrollment RENAME COLUMN razorpay_signature TO gateway_signature;
  END IF;
END $$;

-- ─── Step 6: Add is_platform_admin to profiles if not exists ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_platform_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_platform_admin BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_platform_admin ON profiles(is_platform_admin) WHERE is_platform_admin = true;


-- =============================================================
-- Step 7: Create/Replace create_payment_order_atomic RPC
-- Drop old 6-param version first (from migration 0081)
-- =============================================================
DROP FUNCTION IF EXISTS create_payment_order_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, UUID);

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

    -- 2. Lock the enrollment row
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

    IF ABS(p_amount - v_enrollment.attendance_fee) > 0.01 THEN
      RAISE EXCEPTION 'Amount % does not match fine %', p_amount, v_enrollment.attendance_fee
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF p_due_type = 'college_fee' THEN
    DECLARE
      v_total_due NUMERIC(10,2);
    BEGIN
      SELECT COALESCE(SUM(fine_amount - COALESCE(paid_amount, 0)), 0)
      INTO v_total_due
      FROM student_dues
      WHERE student_id = p_student_id
        AND status = 'pending'
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

  -- 3. Insert the payment order
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

GRANT EXECUTE ON FUNCTION create_payment_order_atomic TO service_role;


-- =============================================================
-- Step 8: Create/Replace process_payment_webhook RPC
-- =============================================================
CREATE OR REPLACE FUNCTION process_payment_webhook(
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_amount_paid NUMERIC
)
RETURNS JSON AS $$
DECLARE
  _order RECORD;
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

  UPDATE payment_orders
  SET status = 'paid',
      gateway_payment_id = p_razorpay_payment_id,
      amount_paid = p_amount_paid,
      paid_at = now()
  WHERE id = _order.id;

  IF _order.enrollment_id IS NOT NULL THEN
    UPDATE subject_enrollment
    SET attendance_fee_verified = true,
        gateway_payment_id = p_razorpay_payment_id,
        payment_date = now()
    WHERE id = _order.enrollment_id
      AND student_id = _order.student_id;
  END IF;

  IF _order.due_type = 'college_fee' THEN
    UPDATE student_dues
    SET status = 'completed',
        paid_amount = p_amount_paid,
        updated_at = now()
    WHERE student_id = _order.student_id;
  END IF;

  INSERT INTO activity_logs (user_id, user_role, action, details, tenant_id)
  VALUES (
    _order.student_id, 'student', 'Payment Completed',
    format('Payment ₹%s verified via %s (Order: %s, Payment: %s)',
           p_amount_paid, _order.gateway_type, p_razorpay_order_id, p_razorpay_payment_id),
    _order.tenant_id
  );

  RETURN json_build_object('success', true, 'student_id', _order.student_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
