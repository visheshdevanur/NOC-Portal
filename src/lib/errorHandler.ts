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
  
  return msg;
};
