-- Migration to delete all students, faculty, and staff
-- Note: This deletes users from the auth.users table, which cascades and deletes
-- their profiles, subject_enrollments, department_clearances, clearance_master, etc.

DELETE FROM auth.users
WHERE id IN (
  SELECT id FROM public.profiles 
  WHERE role IN ('student', 'faculty', 'staff')
);
