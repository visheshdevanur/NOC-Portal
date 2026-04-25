-- 0043_add_fyc_role.sql
-- Add 'fyc' (First Year Coordinator) to the user_role enum

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'fyc';
