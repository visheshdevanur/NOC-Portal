import { supabase } from '../supabase';

// =======================
// SYSTEM LOGS & SHARED HELPERS
// =======================
export const logActivity = async (action: string, details?: string, _retries = 2): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('full_name, role, department_id').eq('id', user.id).single();

    const { error } = await supabase.from('activity_logs').insert([{
      user_id: user.id,
      user_role: profile?.role,
      department_id: profile?.department_id,
      user_name: profile?.full_name,
      action,
      details
    }]);

    // Retry on transient failures (network, timeout)
    if (error && _retries > 0) {
      console.warn(`[logActivity] Retrying audit log write (${_retries} left):`, error.message);
      await new Promise(r => setTimeout(r, 500));
      return logActivity(action, details, _retries - 1);
    }
    if (error) {
      console.error('[logActivity] Audit log write FAILED after retries:', error.message);
    }
  } catch (err) {
    // Retry on thrown errors (network failures)
    if (_retries > 0) {
      await new Promise(r => setTimeout(r, 500));
      return logActivity(action, details, _retries - 1);
    }
    console.error('[logActivity] Audit log write FAILED after retries:', err);
  }
};

/** Helper to detect 1st/2nd year semesters by name */
export const isFirstYearSem = (name: string) => {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n.includes('1st') || n.includes('2nd') || n === '1' || n === '2' || n.includes('first') || n.includes('second');
};

export const getActivityLogs = async (limit: number = 200, offset: number = 0) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
};
