import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import { CheckCircle2, XCircle, Clock, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Payment Callback Page — HDFC SmartGateway return_url handler.
 * 
 * After the student completes (or abandons) payment on HDFC's page,
 * they are redirected here (POST or GET). This page:
 * 1. Tries to restore the session and verify payment via edge function
 * 2. If auth is unavailable, shows a helpful status based on stored info
 * 3. Always provides a link back to the dashboard
 */
export default function PaymentCallback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed' | 'pending' | 'error'>('loading');
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Retrieve stored payment info (set before redirect to HDFC)
  const storedOrderId = sessionStorage.getItem('hdfc_order_id');
  const storedAmount = sessionStorage.getItem('hdfc_payment_amount');

  const orderId =
    storedOrderId ||
    searchParams.get('order_id') ||
    searchParams.get('orderId') ||
    new URLSearchParams(window.location.hash.split('?')[1] || '').get('order_id');

  // Try to verify payment status via edge function
  const verifyPayment = async (oid: string) => {
    try {
      // First try to refresh the session
      await supabase.auth.refreshSession();
      
      const { invokeWithRetry } = await import('../lib/invokeWithRetry');
      const result = await invokeWithRetry('hdfc-order-status', { order_id: oid }) as any;

      setOrderDetails(result);

      if (result.status === 'CHARGED') {
        setStatus('success');
        sessionStorage.removeItem('hdfc_order_id');
        sessionStorage.removeItem('hdfc_payment_amount');
        sessionStorage.removeItem('hdfc_payment_description');
      } else if (['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED'].includes(result.status)) {
        setStatus('failed');
        setErrorMsg(`Payment was not successful. Status: ${result.status}`);
        sessionStorage.removeItem('hdfc_order_id');
      } else {
        setStatus('pending');
      }
    } catch {
      // Verification failed (likely expired session) — show pending status
      // The webhook will process the actual payment server-side
      setStatus('pending');
    }
  };

  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      setErrorMsg('No payment session found. If you completed a payment, please check your dashboard.');
      return;
    }

    // Try to verify, but don't block on auth
    const timer = setTimeout(() => {
      verifyPayment(orderId);
    }, 1000); // Small delay to let auth restore

    // Fallback: if still loading after 8s, show pending
    const fallback = setTimeout(() => {
      setStatus(prev => prev === 'loading' ? 'pending' : prev);
    }, 8000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, []);

  // Once user becomes available, retry verification if still loading/pending
  useEffect(() => {
    if (user && orderId && (status === 'loading' || status === 'pending')) {
      verifyPayment(orderId);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card rounded-3xl shadow-xl border border-border p-8 text-center">
        {/* Loading State */}
        {status === 'loading' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
              <Clock className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Verifying Payment</h1>
            <p className="text-muted-foreground mb-4">
              Please wait while we confirm your payment with HDFC Bank...
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </>
        )}

        {/* Success State */}
        {status === 'success' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-emerald-500/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h1>
            <p className="text-muted-foreground mb-6">Your attendance fine has been cleared.</p>
            
            <div className="bg-secondary/50 rounded-2xl p-5 mb-6 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Amount Paid</span>
                <span className="font-bold text-emerald-600">
                  {'\u20B9'}{orderDetails?.amount || storedAmount || '\u2014'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Transaction ID</span>
                <span className="font-mono text-xs text-foreground">{orderDetails?.payment_id || '\u2014'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs text-foreground">{orderDetails?.order_id || orderId || '\u2014'}</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Return to Dashboard
            </button>
          </>
        )}

        {/* Failed State */}
        {status === 'failed' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-destructive/10 rounded-full flex items-center justify-center">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Failed</h1>
            <p className="text-muted-foreground mb-4">
              {errorMsg || 'The payment could not be processed. No amount has been deducted.'}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              If money was deducted, it will be refunded automatically within 5-7 business days.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </button>
          </>
        )}

        {/* Pending State — also shown when auth is unavailable */}
        {status === 'pending' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-amber-500/10 rounded-full flex items-center justify-center">
              <RefreshCw className="w-10 h-10 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Processing</h1>
            <p className="text-muted-foreground mb-4">
              Your payment is being processed. The status will be updated on your dashboard shortly.
            </p>

            {orderId && (
              <div className="bg-secondary/50 rounded-2xl p-4 mb-6 text-left space-y-2">
                {storedAmount && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="font-bold">{'\u20B9'}{storedAmount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Order ID</span>
                  <span className="font-mono text-xs text-foreground">{orderId}</span>
                </div>
              </div>
            )}

            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Go to Dashboard
            </button>

            <p className="text-xs text-muted-foreground mt-4">
              Your payment status will update automatically. Please check your dashboard.
            </p>
          </>
        )}

        {/* Error State */}
        {status === 'error' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-amber-500/10 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Unable to Verify</h1>
            <p className="text-muted-foreground mb-6">
              {errorMsg || 'Could not verify payment status. Please check your dashboard for the latest status.'}
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
