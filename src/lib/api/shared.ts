import { supabase } from '../supabase';

// =======================
// SYSTEM LOGS & SHARED HELPERS
// =======================
export const logActivity = async (action: string, details?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('full_name, role, department_id').eq('id', user.id).single();

    await supabase.from('activity_logs').insert([{
      user_id: user.id,
      user_role: profile?.role,
      department_id: profile?.department_id,
      user_name: profile?.full_name,
      action,
      details
    }]);
  } catch (err) {
    // Logging failure should never break the main operation
    console.error('[logActivity] Failed to write audit log:', err);
  }
};

/** Helper to detect 1st/2nd year semesters by name */
export const isFirstYearSem = (name: string) => {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n.includes('1st') || n.includes('2nd') || n === '1' || n === '2' || n.includes('first') || n.includes('second');
};

export const getActivityLogs = async (limit: number = 500) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
};
