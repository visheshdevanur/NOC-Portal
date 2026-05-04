import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || '';

/**
 * Super Admin Supabase client using the service_role key.
 * Lazily initialized — only created when first accessed.
 * This prevents crashes when the env var isn't set for regular users.
 */
let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!serviceKey) {
    throw new Error('VITE_SUPABASE_SERVICE_KEY is not configured. Please add it to your Vercel environment variables.');
  }
  if (!_client) {
    _client = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

// Keep backward compat — but as a getter that won't crash on import
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});
