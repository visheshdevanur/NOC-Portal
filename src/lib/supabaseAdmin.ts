import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || '';

/**
 * Super Admin Supabase client using the service_role key.
 * This bypasses ALL RLS policies and should ONLY be used
 * in the Super Admin panel components.
 * 
 * SECURITY: The service key is only exposed to the super admin
 * login-gated routes, never to regular tenant users.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
