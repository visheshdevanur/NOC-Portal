-- 0011_accounts_schema.sql
-- Step 1: Add 'accounts' to user_role enum (must be committed separately)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accounts';
