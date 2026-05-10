/**
 * Parse any error into a human-readable message.
 * Used across all dashboards for consistent error reporting.
 */
export const parseError = (error: any): string => {
  if (!error) return 'An unexpected error occurred. Please try again.';

  if (error.message) {
    const msg = error.message.toLowerCase();

    if (msg.includes('invalid login credentials'))
      return 'Incorrect email or password. Please check and try again.';
    if (msg.includes('email not confirmed'))
      return 'Your email is not verified. Please check your inbox.';
    if (msg.includes('user already registered'))
      return 'This email is already registered. Use a different email.';
    if (msg.includes('password should be at least'))
      return 'Password is too short. It must be at least 6 characters.';
    if (msg.includes('jwt expired') || msg.includes('session expired'))
      return 'Your session has expired. Please log in again.';
    if (msg.includes('not authorized') || msg.includes('permission denied'))
      return 'You do not have permission to perform this action.';
    if (msg.includes('duplicate key') || msg.includes('unique constraint'))
      return 'This record already exists. Please check for duplicates.';
    if (msg.includes('foreign key constraint'))
      return 'This record is linked to other data and cannot be removed.';
    if (msg.includes('null value in column'))
      return 'A required field is missing. Please fill in all fields.';
    if (msg.includes('connection') || msg.includes('network'))
      return 'Cannot connect to the server. Please check your internet connection.';
    if (msg.includes('timeout'))
      return 'The request took too long. Please try again.';
    if (msg.includes('row-level security') || msg.includes('rls'))
      return 'Access denied. You are not allowed to view or edit this data.';
    if (msg.includes('edge function') || msg.includes('non-2xx') || msg.includes('2xx'))
      return 'Server-side processing failed. Please try again.';

    // Return original message if it's short and readable
    if (!/\d{3}/.test(msg) && msg.length < 120)
      return error.message;
  }

  if (error.name === 'TypeError' && error.message?.includes('fetch'))
    return 'Network error. Please check your internet connection and try again.';

  return 'An unexpected error occurred. Please try again or contact support.';
};

export default parseError;
