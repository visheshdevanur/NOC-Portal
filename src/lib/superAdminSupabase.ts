/**
 * Separate Supabase client for the Super Admin portal.
 * FIX #22: Uses a different storage key to prevent session collision
 * with the regular NOC portal. This ensures super admin login doesn't
 * destroy regular user sessions in other tabs.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const superAdminSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'sb-superadmin-auth',
    autoRefreshToken: true,
    persistSession: true,
  },
});
