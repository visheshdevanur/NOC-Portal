import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/useAuth';
import { CheckCircle2, XCircle, Clock, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Payment Callback Page — HDFC SmartGateway return_url handler.
 * 
 * After the student completes (or abandons) payment on HDFC's page,
 * they are redirected here (POST or GET). This page:
 * 1. Extracts the order_id from sessionStorage or URL params
 * 2. Calls the hdfc-order-status edge function to verify payment
 * 3. Displays the result and links back to the dashboard
 */
export default function PaymentCallback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed' | 'pending' | 'error'>('loading');
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkOrderStatus = useCallback(async (orderId: string) => {
    try {
      const { invokeWithRetry } = await import('../lib/invokeWithRetry');
      const result = await invokeWithRetry('hdfc-order-status', { order_id: orderId }) as any;

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
      } else if (['PENDING_VBV', 'NEW', 'STARTED', 'CREATED'].includes(result.status)) {
        setStatus('pending');
        // Auto-retry for pending status (max 5 times, every 3 seconds)
        if (retryCount < 5) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
            checkOrderStatus(orderId);
          }, 3000);
        }
      } else {
        setStatus('pending');
        setErrorMsg(`Payment status: ${result.status}. Please wait or check your dashboard.`);
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to verify payment status');
    }
  }, [retryCount]);

  useEffect(() => {
    // Wait for auth to load — user may be null briefly after HDFC redirect
    if (!user) {
      // Give auth a few seconds to restore session, then show error
      const timeout = setTimeout(() => {
        if (!user) {
          setStatus('error');
          setErrorMsg('Session expired. Please log in and check your dashboard for payment status.');
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }

    // Try multiple sources for order_id:
    // 1. sessionStorage (set before redirect)
    // 2. URL search params (HDFC may append as query param)
    // 3. Hash params
    const orderId =
      sessionStorage.getItem('hdfc_order_id') ||
      searchParams.get('order_id') ||
      searchParams.get('orderId') ||
      new URLSearchParams(window.location.hash.split('?')[1] || '').get('order_id');

    if (!orderId) {
      setStatus('error');
      setErrorMsg('No payment session found. If you completed a payment, please check your dashboard.');
      return;
    }

    checkOrderStatus(orderId);
  }, [user]);

  const storedAmount = sessionStorage.getItem('hdfc_payment_amount');
  const storedDescription = sessionStorage.getItem('hdfc_payment_description');

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
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Successful! ✅</h1>
            <p className="text-muted-foreground mb-6">Your attendance fine has been cleared.</p>
            
            <div className="bg-secondary/50 rounded-2xl p-5 mb-6 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Amount Paid</span>
                <span className="font-bold text-emerald-600">₹{orderDetails?.amount || storedAmount || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Transaction ID</span>
                <span className="font-mono text-xs text-foreground">{orderDetails?.payment_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs text-foreground">{orderDetails?.order_id || '—'}</span>
              </div>
              {storedDescription && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Description</span>
                  <span className="text-sm text-foreground">{storedDescription}</span>
                </div>
              )}
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

        {/* Pending State */}
        {status === 'pending' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-amber-500/10 rounded-full flex items-center justify-center animate-pulse">
              <RefreshCw className="w-10 h-10 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Processing</h1>
            <p className="text-muted-foreground mb-4">
              {errorMsg || 'Your payment is being processed. This may take a few moments...'}
            </p>
            {retryCount < 5 && (
              <p className="text-xs text-muted-foreground mb-6">Auto-checking status... ({retryCount + 1}/5)</p>
            )}
            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 bg-secondary text-foreground font-bold rounded-xl hover:bg-secondary/80 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Go to Dashboard (will update automatically)
            </button>
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
