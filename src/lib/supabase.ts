import { createClient } from '@supabase/supabase-js';

// FIX #25: Throw on missing env vars instead of silently falling back to placeholders
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

// FIX #29: Database types generated at src/lib/database.types.ts
// TODO: Wire into createClient<Database> once dashboard local types are aligned
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Secure User Creation via Edge Function ───
// Replaces the old tempSupabase.auth.signUp() pattern which was insecure.
// The Edge Function validates caller permissions and prevents privilege escalation.
// Uses invokeWithRetry for automatic exponential backoff on transient failures.

export async function createUserSecure(params: {
  email: string;
  password: string;
  full_name: string;
  role: string;
  department_id?: string;
  roll_number?: string;
  teacher_id?: string;
  section?: string;
  semester_id?: string;
}): Promise<{ user_id: string; message: string }> {
  const { invokeWithRetry } = await import('./invokeWithRetry');
  return invokeWithRetry<{ user_id: string; message: string }>('create-user', params);
}
