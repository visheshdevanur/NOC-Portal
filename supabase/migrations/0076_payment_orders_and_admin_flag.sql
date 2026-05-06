-- Payment orders table for webhook reconciliation
-- This table bridges the gap between client-side Razorpay checkout and 
-- server-side webhook confirmation, enabling atomic payment processing.

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES subject_enrollment(id),
  due_type TEXT NOT NULL DEFAULT 'attendance_fine' CHECK (due_type IN ('attendance_fine', 'college_fee', 'library_fine')),
  amount NUMERIC(10,2) NOT NULL,
  amount_paid NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  tenant_id UUID REFERENCES tenants(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_orders_razorpay_order ON payment_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_student ON payment_orders(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_tenant ON payment_orders(tenant_id);

-- RLS: Students can only see their own orders
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own orders"
  ON payment_orders FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Service role can manage all orders"
  ON payment_orders FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add is_platform_admin column to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_platform_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_platform_admin BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index for super admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_platform_admin ON profiles(is_platform_admin) WHERE is_platform_admin = true;
