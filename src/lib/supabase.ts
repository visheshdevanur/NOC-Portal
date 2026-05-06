import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Secure User Creation via Edge Function ───
// Replaces the old tempSupabase.auth.signUp() pattern which was insecure.
// The Edge Function validates caller permissions and prevents privilege escalation.

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
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: params,
  });

  if (error) {
    throw new Error(error.message || 'User creation failed');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as { user_id: string; message: string };
}
