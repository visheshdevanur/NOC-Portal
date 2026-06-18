// =======================
// HDFC SMARTGATEWAY INTEGRATION
// =======================

/**
 * Create an HDFC SmartGateway payment session for a single attendance fine.
 * Returns { payment_link, order_id, amount } from the edge function.
 */
export const createHdfcSession = async (amount: number, enrollmentId: string) => {
  const { invokeWithRetry } = await import('../invokeWithRetry');
  return invokeWithRetry('create-hdfc-session', {
    amount,
    enrollment_id: enrollmentId,
    due_type: 'attendance_fine',
  });
};

/**
 * Create an HDFC SmartGateway payment session for bulk attendance fines.
 * Returns { payment_link, order_id, amount } from the edge function.
 */
export const createBulkHdfcSession = async (totalAmount: number, enrollmentIds: string[]) => {
  const { invokeWithRetry } = await import('../invokeWithRetry');
  return invokeWithRetry('create-hdfc-session', {
    amount: totalAmount,
    enrollment_ids: enrollmentIds,
    due_type: 'attendance_fine_bulk',
  });
};

/**
 * Check the status of an HDFC payment order.
 * Called from the payment callback page after redirect.
 * Returns { status, order_id, amount, payment_id }
 */
export const checkHdfcOrderStatus = async (orderId: string) => {
  const { invokeWithRetry } = await import('../invokeWithRetry');
  return invokeWithRetry('hdfc-order-status', {
    order_id: orderId,
  });
};

/**
 * Create an HDFC SmartGateway payment session for other dues.
 * Returns { payment_link, order_id, amount } from the edge function.
 */
export const createOtherDuesHdfcSession = async (amount: number, dueId: string) => {
  const { invokeWithRetry } = await import('../invokeWithRetry');
  return invokeWithRetry('create-hdfc-session', {
    amount,
    enrollment_id: dueId, // reuse enrollment_id field for other_due_id
    due_type: 'other_dues',
  });
};
