import { logPlatformError, type PlatformErrorSeverity } from './superAdminApi';
import { supabase } from './supabase';

export const getFriendlyErrorMessage = (err: any): string => {
  if (!err) return 'An unknown error occurred.';
  const msg = typeof err === 'string' ? err : (err.message || err.error_description || JSON.stringify(err));
  
  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('duplicate key value')) {
    if (lowerMsg.includes('roll_number')) return 'This roll number is already assigned to another student.';
    if (lowerMsg.includes('email')) return 'This email address is already in use.';
    if (lowerMsg.includes('subject_code')) return 'This subject code already exists.';
    return 'A record with this information already exists.';
  }
  
  if (lowerMsg.includes('user already registered')) return 'This email is already registered to another account.';
  if (lowerMsg.includes('password should be at least')) return 'Password must be at least 6 characters long.';
  if (lowerMsg.includes('invalid input syntax for type uuid')) return 'Invalid ID format provided.';
  if (lowerMsg.includes('jwt')) return 'Your session has expired. Please log in again.';
  if (lowerMsg.includes('violates foreign key constraint')) return 'This operation cannot be completed because it references records that do not exist.';
  if (lowerMsg.includes('failed to fetch')) return 'Network connection lost. Please check your internet connection and try again.';
  
  return msg;
};

/**
 * Enhanced error logger that formats the error for the user while silently 
 * logging the raw details to the SuperAdmin Developer Portal.
 */
export const logAndFormatError = async (
  err: any,
  context: {
    dashboard_name: string;
    nav_path?: string;
    error_code?: string;
    severity?: PlatformErrorSeverity;
    profile?: { id?: string; email?: string; role?: string; tenant_id?: string | null } | null;
    action?: string; // Short descriptor for logging
  }
): Promise<string> => {
  const friendlyMsg = getFriendlyErrorMessage(err);
  const rawError = typeof err === 'string' ? err : (err.message || err.error_description || JSON.stringify(err));

  // Determine severity - network issues or token issues might just be warnings
  let severity = context.severity || 'CRITICAL';
  if (rawError.toLowerCase().includes('failed to fetch') || rawError.toLowerCase().includes('jwt')) {
    severity = 'WARNING';
  }

  // Generate an error code if none provided
  const errorCode = context.error_code || `ERR_${context.action?.replace(/\s+/g, '_').toUpperCase() || 'UNKNOWN'}`;

  // Fetch profile if not provided
  let userProfile = context.profile;
  if (!userProfile) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userProfile = { id: user.id, email: user.email };
      }
    } catch {
      // ignore
    }
  }

  // Log to platform
  try {
    await logPlatformError({
      dashboard_name: context.dashboard_name,
      nav_path: context.nav_path,
      error_code: errorCode,
      severity,
      error_detail: `[${context.action || 'Action'}] ${rawError}`,
      triggered_by_role: userProfile?.role,
      triggered_by_email: userProfile?.email || userProfile?.id,
    });
  } catch (logErr) {
    console.warn('Failed to log platform error:', logErr);
  }

  return friendlyMsg;
};
