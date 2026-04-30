-- Migration to delete all students, faculty, and staff
-- Note: This deletes users from the auth.users table, which cascades and deletes
-- their profiles, subject_enrollments, department_clearances, clearance_master, etc.

-- Fix foreign key constraint on activity_logs to allow deletion
ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix foreign key constraint on profiles.created_by
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_created_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix foreign key constraint on attendance_fine_categories.created_by
ALTER TABLE public.attendance_fine_categories
  DROP CONSTRAINT IF EXISTS attendance_fine_categories_created_by_fkey;
ALTER TABLE public.attendance_fine_categories
  ADD CONSTRAINT attendance_fine_categories_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Now delete the users (this cascades to profiles, clearances, etc.)
DELETE FROM auth.users
WHERE id IN (
  SELECT id FROM public.profiles 
  WHERE role IN ('student', 'teacher', 'faculty', 'staff')
);
