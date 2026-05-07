import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// RAZORPAY INTEGRATION
// =======================
export const createRazorpayOrder = async (amount: number, enrollmentId: string) => {
  const { invokeWithRetry } = await import('../invokeWithRetry');
  return invokeWithRetry('create-razorpay-order', {
    amount, receipt: enrollmentId, enrollment_id: enrollmentId, due_type: 'attendance_fine',
  });
};

export const verifyAndProcessRazorpayPayment = async (
  enrollmentId: string, razorpay_order_id: string, razorpay_payment_id: string, _razorpay_signature: string
) => {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const { data: order } = await supabase.from('payment_orders').select('status').eq('razorpay_order_id', razorpay_order_id).single();
    if (order?.status === 'paid') {
      logActivity('Attendance Due Paid', `Paid fine via Razorpay (Payment: ${razorpay_payment_id})`);
      return { success: true };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await supabase.from('subject_enrollment').update({ razorpay_order_id, razorpay_payment_id, remarks: 'Payment submitted — awaiting webhook confirmation' }).eq('id', enrollmentId);
  logActivity('Payment Pending', `Razorpay payment ${razorpay_payment_id} awaiting webhook confirmation`);
  return { success: true, pending_confirmation: true };
};

export const createBulkRazorpayOrder = async (totalAmount: number, enrollmentIds: string[]) => {
  const { invokeWithRetry } = await import('../invokeWithRetry');
  return invokeWithRetry('create-razorpay-order', {
    amount: totalAmount, receipt: `bulk_${enrollmentIds.length}_${Date.now()}`, enrollment_ids: enrollmentIds, due_type: 'attendance_fine_bulk',
  });
};

export const verifyAndProcessBulkRazorpayPayment = async (
  enrollmentIds: string[], razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string
) => {
  const { invokeWithRetry } = await import('../invokeWithRetry');
  const result = await invokeWithRetry('verify-razorpay-payment', {
    razorpay_order_id, razorpay_payment_id, razorpay_signature, enrollment_ids: enrollmentIds, is_bulk: true,
  });
  logActivity('Bulk Attendance Payment', `Paid fines for ${enrollmentIds.length} subjects via Razorpay (ID: ${razorpay_payment_id})`);
  return result;
};
