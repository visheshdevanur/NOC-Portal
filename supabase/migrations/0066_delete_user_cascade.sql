-- Migration to ensure deleting a profile also deletes the auth.users record
-- This is necessary so that when HOD/FYC deletes a user, their credentials become invalid.

CREATE OR REPLACE FUNCTION public.handle_deleted_profile()
RETURNS trigger AS $$
BEGIN
  -- Delete the corresponding user in auth.users
  -- This will safely affect 0 rows if the user is already deleted
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it already exists to ensure idempotency
DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;

-- Create the trigger
CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deleted_profile();
