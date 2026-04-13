-- 0007_add_teacher_role.sql
-- Add teacher role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'teacher';
