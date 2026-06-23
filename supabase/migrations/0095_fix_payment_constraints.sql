-- Add 'other_dues' to payment_orders due_type constraint
ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_due_type_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_due_type_check 
  CHECK (due_type IN ('attendance_fine', 'attendance_fine_bulk', 'college_fee', 'library_fine', 'other_dues'));

-- Add metadata and request_hash columns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE payment_orders ADD COLUMN metadata JSONB;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_orders' AND column_name = 'request_hash'
  ) THEN
    ALTER TABLE payment_orders ADD COLUMN request_hash TEXT;
  END IF;
END $$;
