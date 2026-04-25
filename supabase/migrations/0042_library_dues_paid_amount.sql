-- 0042_library_dues_paid_amount.sql
-- Add paid_amount tracking to library_dues

ALTER TABLE public.library_dues ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
