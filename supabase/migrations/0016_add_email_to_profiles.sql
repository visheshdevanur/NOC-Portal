-- 0016_add_email_to_profiles.sql
-- Add email field to profiles and provide an RPC to safely update user emails

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill existing profiles with their auth email
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Function to update both auth.users and profiles
CREATE OR REPLACE FUNCTION admin_update_user_credentials(target_user_id UUID, new_email TEXT, new_password TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  -- Check authorization: Only admin, staff, or hod can run this
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'hod')) THEN
    RAISE EXCEPTION 'Not authorized to update user credentials';
  END IF;

  IF new_email IS NOT NULL AND new_email != '' THEN
    UPDATE auth.users SET email = new_email, email_confirmed_at = now() WHERE id = target_user_id;
    UPDATE profiles SET email = new_email WHERE id = target_user_id;
  END IF;
  
  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf')) WHERE id = target_user_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
