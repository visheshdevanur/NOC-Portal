import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/useAuth';
import { supabase } from '../lib/supabase';
import { CheckCircle2, XCircle, Clock, AlertCircle, ArrowLeft, RefreshCw, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Payment Callback Page — HDFC SmartGateway return_url handler.
 * 
 * After the student completes (or abandons) payment on HDFC's page,
 * they are redirected here (POST or GET). This page:
 * 1. Extracts order_id from ALL possible sources (URL, storage, POST body)
 * 2. Verifies payment via edge function with retry logic
 * 3. Shows a downloadable receipt on success
 * 4. Always provides a link back to the dashboard
 */

/** Generate a printable HTML receipt and trigger download */
function downloadReceipt(details: {
  orderId: string;
  paymentId?: string;
  amount: string;
  date: string;
  studentName?: string;
  status: string;
  tenantName?: string;
}) {
  const headerTitle = details.tenantName || 'NO DUE PORTAL';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payment Receipt - ${details.orderId}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; color: #1a1a1a; }
  .header { text-align: center; border-bottom: 3px solid #004bca; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { font-size: 24px; margin: 0 0 4px; color: #004bca; }
  .header p { font-size: 13px; color: #666; margin: 0; }
  .badge { display: inline-block; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
  .row .label { color: #666; font-size: 14px; }
  .row .value { font-weight: 600; font-size: 14px; text-align: right; max-width: 60%; word-break: break-all; }
  .amount { font-size: 28px; font-weight: 800; color: #166534; text-align: center; margin: 24px 0; }
  .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="header">
  <h1>${headerTitle}</h1>
  <p>Payment Receipt</p>
</div>
<div style="text-align:center;margin-bottom:24px;">
  <span class="badge ${details.status === 'CHARGED' ? 'badge-success' : 'badge-pending'}">
    ${details.status === 'CHARGED' ? 'PAYMENT SUCCESSFUL' : 'PAYMENT PROCESSING'}
  </span>
</div>
<div class="amount">\u20B9${details.amount}</div>
${details.studentName ? `<div class="row"><span class="label">Student</span><span class="value">${details.studentName}</span></div>` : ''}
<div class="row"><span class="label">Order ID</span><span class="value" style="font-family:monospace;font-size:12px;">${details.orderId}</span></div>
${details.paymentId ? `<div class="row"><span class="label">Transaction ID</span><span class="value" style="font-family:monospace;font-size:12px;">${details.paymentId}</span></div>` : ''}
<div class="row"><span class="label">Date</span><span class="value">${details.date}</span></div>
<div class="row"><span class="label">Payment Method</span><span class="value">HDFC SmartGateway</span></div>
<div class="row"><span class="label">Purpose</span><span class="value">Attendance Fine</span></div>
<div class="footer">
  <p>This is a computer-generated receipt. No signature required.</p>
  <p>For queries, contact your institution's accounts department.</p>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt_${details.orderId}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Extract order_id from ALL possible sources.
 * HDFC may redirect via GET (query params) or POST (form body) — 
 * and may modify the URL. We try everything.
 */
function extractOrderId(): string | null {
  // 1. URL search params (GET redirect): ?order_id=XXX
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrlParam = urlParams.get('order_id') || urlParams.get('orderId');
  if (fromUrlParam) return fromUrlParam;

  // 2. URL hash params (SPA fallback): #?order_id=XXX
  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const fromHash = hashParams.get('order_id') || hashParams.get('orderId');
  if (fromHash) return fromHash;

  // 3. sessionStorage (set before redirect — same tab only)
  const fromSession = sessionStorage.getItem('hdfc_order_id');
  if (fromSession) return fromSession;

  // 4. localStorage (set before redirect — persists across tabs/domains)
  const fromLocal = localStorage.getItem('hdfc_order_id');
  if (fromLocal) return fromLocal;

  return null;
}

export default function PaymentCallback() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed' | 'pending' | 'error'>('loading');
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [tenantName, setTenantName] = useState<string | undefined>(undefined);

  // Fetch tenant name
  useEffect(() => {
    (async () => {
      try {
        if (!profile?.tenant_id) return;
        const { data } = await supabase.from('tenants').select('name').eq('id', profile.tenant_id).single();
        if (data?.name) setTenantName(data.name);
      } catch { /* ignore */ }
    })();
  }, [profile?.tenant_id]);

  // Extract order info ONCE using ref to avoid re-extraction
  const orderIdRef = useRef<string | null>(null);
  if (orderIdRef.current === null) {
    orderIdRef.current = extractOrderId();
  }
  const orderId = orderIdRef.current;

  const orderToken =
    sessionStorage.getItem('hdfc_order_token') ||
    new URLSearchParams(window.location.search).get('order_token') ||
    new URLSearchParams(window.location.hash.split('?')[1] || '').get('order_token') ||
    localStorage.getItem('hdfc_order_token');

  const storedAmount =
    sessionStorage.getItem('hdfc_payment_amount') ||
    localStorage.getItem('hdfc_payment_amount');

  // Guard: only try verification ONCE
  const verifiedRef = useRef(false);

  const verifyPayment = useCallback(async (oid: string, attempt: number = 1) => {
    if (verifiedRef.current && attempt === 1) return;
    verifiedRef.current = true;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/hdfc-order-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ order_id: oid, callback_mode: true, order_token: orderToken || undefined }),
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const result = await response.json();
      setOrderDetails(result);

      if (result.status === 'CHARGED') {
        setStatus('success');
        // Clean up ALL storage
        ['hdfc_order_id', 'hdfc_order_token', 'hdfc_payment_amount', 'hdfc_payment_description'].forEach(key => {
          sessionStorage.removeItem(key);
          localStorage.removeItem(key);
        });
      } else if (['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED', 'FAILED', 'DECLINED', 'TXN_FAILED'].includes(result.status)) {
        setStatus('failed');
        setErrorMsg(`Payment was not successful. Status: ${result.status}`);
        ['hdfc_order_id', 'hdfc_order_token'].forEach(key => {
          sessionStorage.removeItem(key);
          localStorage.removeItem(key);
        });
      } else {
        // Status is still pending/processing — retry up to 3 times with increasing delays
        if (attempt < 3) {
          setRetryCount(attempt);
          const delay = attempt * 4000; // 4s, 8s
          setTimeout(() => verifyPayment(oid, attempt + 1), delay);
        } else {
          // After 3 attempts, show pending with order info
          setStatus('pending');
        }
      }
    } catch {
      // Verification failed — show pending, webhook will handle it
      if (attempt < 2) {
        setTimeout(() => verifyPayment(oid, attempt + 1), 3000);
      } else {
        setStatus('pending');
      }
    }
  }, [orderToken]);

  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      setErrorMsg('No payment session found. If you completed a payment, please check your dashboard.');
      return;
    }

    // Start verification after a short delay to let auth restore
    const timer = setTimeout(() => {
      verifyPayment(orderId);
    }, 1500);

    // Fallback: if still loading after 20s (accounting for retries), show pending
    const fallback = setTimeout(() => {
      setStatus(prev => prev === 'loading' ? 'pending' : prev);
    }, 20000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, [orderId, verifyPayment]);

  const handleDownloadReceipt = () => {
    downloadReceipt({
      orderId: orderDetails?.order_id || orderId || 'N/A',
      paymentId: orderDetails?.payment_id,
      amount: orderDetails?.amount || storedAmount || '0',
      date: new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }),
      studentName: profile?.full_name || undefined,
      status: orderDetails?.status || (status === 'success' ? 'CHARGED' : 'PENDING'),
      tenantName,
    });
  };

  const goToDashboard = () => {
    navigate('/');
  };

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
              {retryCount > 0 && (
                <span className="block text-xs mt-1 text-primary">
                  Attempt {retryCount + 1} of 3...
                </span>
              )}
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
              {profile?.full_name && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Student</span>
                  <span className="text-sm font-medium text-foreground">{profile.full_name}</span>
                </div>
              )}
            </div>

            {/* Download Receipt */}
            <button
              onClick={handleDownloadReceipt}
              className="w-full py-3 mb-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download Receipt
            </button>

            <button
              onClick={goToDashboard}
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
              onClick={goToDashboard}
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

            {/* Download pending receipt */}
            <button
              onClick={handleDownloadReceipt}
              className="w-full py-3 mb-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download Receipt (Pending)
            </button>

            <button
              onClick={goToDashboard}
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
              onClick={goToDashboard}
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
