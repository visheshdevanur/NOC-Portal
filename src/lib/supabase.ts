import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

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
