-- Add principal to Role enum at database level
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'principal';
