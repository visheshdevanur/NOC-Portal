-- =============================================================
-- 0080: Fix payment_orders RLS — CRITICAL SECURITY PATCH
-- =============================================================
-- The original policy "Service role can manage all orders" used
-- USING(true) WITH CHECK(true), allowing ANY authenticated user
-- to read, insert, update, and delete ALL payment orders across
-- ALL tenants. This is an actively exploitable vulnerability.
-- =============================================================

-- Step 1: Drop the dangerously open policy
DROP POLICY IF EXISTS "Service role can manage all orders" ON payment_orders;

-- Step 2: Keep the existing student SELECT policy (already correct)
-- "Students can view own orders" — USING (auth.uid() = student_id)

-- Step 3: Students can INSERT their own orders (needed by create-razorpay-order Edge Function)
-- Note: The Edge Function uses service_role key, so this is a defense-in-depth measure
CREATE POLICY "Students can insert own orders"
  ON payment_orders FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Step 4: Admin and accounts users can view orders within their tenant
CREATE POLICY "Admin and accounts can view tenant orders"
  ON payment_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'accounts', 'principal', 'hod')
      AND tenant_id = payment_orders.tenant_id
    )
  );

-- Step 5: Only service_role (Edge Functions/webhooks) can update/delete orders
-- This is the ONLY way payment status should change (via webhook RPC)
CREATE POLICY "Service role manages orders"
  ON payment_orders FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Step 6: Add tenant isolation RESTRICTIVE policy (matches pattern from 0074)
CREATE POLICY "tenant_isolation_payment_orders"
  ON payment_orders AS RESTRICTIVE
  FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    OR auth.role() = 'service_role'
  );
