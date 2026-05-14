-- Add teacher_id column to profiles (custom identifier for teachers, like roll_number for students)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teacher_id TEXT;
