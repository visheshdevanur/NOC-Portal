-- 0057_razorpay_attendance_payments.sql
-- Add columns to track Razorpay payments for attendance dues

ALTER TABLE subject_enrollment 
ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_signature TEXT,
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;
