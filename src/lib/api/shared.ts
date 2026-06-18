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

/** Normalize semester input from CSV: strips prefixes like "semester", "sem", dashes, etc.
 *  e.g. "Semester 4" → "4", "sem-3" → "3", "4" → "4" */
export const normalizeSemName = (input: string): string => {
  return input.trim().replace(/^(semester|sem)[\s\-_]*/i, '').trim();
};

/** Convert any error into a clear, human-readable message */
export const humanizeError = (err: unknown): string => {
  if (!err) return 'Unknown error occurred';
  if (typeof err === 'string') return humanizeMessage(err);
  if (err instanceof Error) return humanizeMessage(err.message);
  if (typeof err === 'object') {
    const e = err as any;
    if (e.message) return humanizeMessage(e.message);
    if (e.error) return humanizeMessage(typeof e.error === 'string' ? e.error : JSON.stringify(e.error));
    if (e.msg) return humanizeMessage(e.msg);
    const str = JSON.stringify(err);
    return str === '{}' ? 'This user could not be processed. Please check the email and try again.' : str;
  }
  return String(err);
};

const humanizeMessage = (msg: string): string => {
  if (!msg) return 'Unknown error occurred';
  // Translate common technical messages to plain language
  if (msg.includes('non-2xx status code')) return 'Server is busy or the request timed out. Please try uploading in smaller batches.';
  if (msg.includes('already been registered')) return 'This email is already registered in the system.';
  if (msg.includes('duplicate key')) return 'A record with this information already exists.';
  if (msg.includes('violates foreign key')) return 'This record references data that does not exist. Please check department, semester, or section values.';
  if (msg.includes('violates unique constraint')) return 'A duplicate entry was found. This record already exists.';
  if (msg.includes('JWT expired') || msg.includes('Invalid or expired token')) return 'Your session has expired. Please log out and log back in.';
  if (msg.includes('Missing required fields')) return 'Some required columns are missing. Ensure email, password, name, and role are filled.';
  if (msg.includes('permission denied') || msg.includes('403')) return 'You do not have permission to perform this action.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Network error. Please check your internet connection and try again.';
  if (msg.includes('timeout') || msg.includes('Timeout')) return 'The request took too long. Please try with fewer rows.';
  return msg;
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
