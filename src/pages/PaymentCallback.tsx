import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/useAuth';

/**
 * PaymentCallback — HDFC SmartGateway redirect landing page.
 * 
 * After HDFC processes payment, it redirects here.
 * This page:
 *   1. Reads order_id from localStorage/sessionStorage
 *   2. Calls hdfc-order-status edge function
 *   3. Shows payment result (success/failure/pending)
 *   4. Offers receipt download on success
 */
export default function PaymentCallback() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed' | 'pending' | 'error'>('loading');
  const [orderData, setOrderData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const hasChecked = useRef(false);

  const orderId = localStorage.getItem('hdfc_order_id') || sessionStorage.getItem('hdfc_order_id');
  const paymentAmount = localStorage.getItem('hdfc_payment_amount') || sessionStorage.getItem('hdfc_payment_amount');
  const paymentDescription = localStorage.getItem('hdfc_payment_description') || sessionStorage.getItem('hdfc_payment_description');

  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      setErrorMsg('No order ID found. The payment session may have expired.');
      return;
    }

    // Don't re-check if already successful
    if (hasChecked.current && status === 'success') return;

    const checkStatus = async () => {
      try {
        setStatus('loading');
        const { checkHdfcOrderStatus } = await import('../lib/api/payment');
        const result = await checkHdfcOrderStatus(orderId) as any;
        
        setOrderData(result);

        if (result.status === 'CHARGED') {
          setStatus('success');
          hasChecked.current = true;
          // Clean up storage
          localStorage.removeItem('hdfc_order_id');
          localStorage.removeItem('hdfc_order_token');
          localStorage.removeItem('hdfc_payment_amount');
          localStorage.removeItem('hdfc_payment_description');
          sessionStorage.removeItem('hdfc_order_id');
          sessionStorage.removeItem('hdfc_order_token');
          sessionStorage.removeItem('hdfc_payment_amount');
          sessionStorage.removeItem('hdfc_payment_description');
        } else if (result.status === 'FAILED') {
          setStatus('failed');
        } else {
          // CREATED, PENDING_VBV, etc.
          setStatus('pending');
        }
      } catch (err: any) {
        console.error('Payment status check failed:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Failed to check payment status');
      }
    };

    checkStatus();
  }, [orderId, retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  const handleGoToDashboard = () => {
    window.location.href = '/';
  };

  const handleDownloadReceipt = () => {
    if (!orderData) return;

    const hdfcRes = orderData.hdfc_response || {};
    const receiptDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const txnId = orderData.txn_id || hdfcRes.txn_id || 'N/A';
    const payMethod = orderData.payment_method || hdfcRes.payment_method_type || 'Online';
    const studentName = profile?.full_name || 'Student';
    const usn = (profile as any)?.roll_number || 'N/A';
    const amount = orderData.amount || paymentAmount || '0';

    // Generate receipt HTML and trigger print dialog
    const receiptWindow = window.open('', '_blank', 'width=600,height=800');
    if (!receiptWindow) {
      alert('Please allow popups to download the receipt.');
      return;
    }

    receiptWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt - ${orderData.order_id}</title>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; 
            background: #f8f9fa; 
            padding: 20px;
            color: #1a1a2e;
          }
          .receipt {
            max-width: 500px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
            overflow: hidden;
          }
          .receipt-header {
            background: linear-gradient(135deg, #004bca, #0066ff);
            color: white;
            padding: 32px 24px;
            text-align: center;
          }
          .receipt-header h1 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 4px;
            letter-spacing: 1px;
          }
          .receipt-header p {
            font-size: 13px;
            opacity: 0.85;
          }
          .success-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(255,255,255,0.15);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 24px;
            padding: 8px 20px;
            margin-top: 16px;
            font-weight: 600;
            font-size: 14px;
          }
          .receipt-body { padding: 24px; }
          .receipt-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
          }
          .receipt-row:last-child { border-bottom: none; }
          .receipt-label {
            font-size: 13px;
            color: #666;
            font-weight: 500;
          }
          .receipt-value {
            font-size: 14px;
            font-weight: 600;
            text-align: right;
            max-width: 60%;
            word-break: break-all;
          }
          .amount-row {
            background: #f0fdf4;
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .amount-row .receipt-label { font-size: 16px; font-weight: 600; color: #333; }
          .amount-row .receipt-value { font-size: 24px; color: #16a34a; }
          .receipt-footer {
            border-top: 2px dashed #e5e5e5;
            padding: 20px 24px;
            text-align: center;
            color: #999;
            font-size: 11px;
            line-height: 1.6;
          }
          @media print {
            body { background: white; padding: 0; }
            .receipt { box-shadow: none; border-radius: 0; }
            .no-print { display: none !important; }
          }
          .print-btn {
            display: block;
            width: calc(100% - 48px);
            margin: 0 24px 24px;
            padding: 14px;
            background: #004bca;
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          }
          .print-btn:hover { background: #003ba3; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="receipt-header">
            <h1>NO DUE PORTAL</h1>
            <p>Payment Receipt</p>
            <div class="success-badge">
              ✓ Payment Successful
            </div>
          </div>

          <div class="receipt-body">
            <div class="amount-row">
              <span class="receipt-label">Amount Paid</span>
              <span class="receipt-value">₹${amount}</span>
            </div>

            <div class="receipt-row">
              <span class="receipt-label">Student Name</span>
              <span class="receipt-value">${studentName}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">USN</span>
              <span class="receipt-value">${usn}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Description</span>
              <span class="receipt-value">${paymentDescription || orderData.due_type || 'Attendance Fine'}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Order ID</span>
              <span class="receipt-value" style="font-family: monospace; font-size: 12px;">${orderData.order_id}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Transaction ID</span>
              <span class="receipt-value" style="font-family: monospace; font-size: 12px;">${txnId}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Payment Method</span>
              <span class="receipt-value">${payMethod}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Status</span>
              <span class="receipt-value" style="color: #16a34a;">✅ Charged</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Date & Time</span>
              <span class="receipt-value">${receiptDate}</span>
            </div>
          </div>

          <button class="print-btn no-print" onclick="window.print()">
            📄 Download / Print Receipt
          </button>

          <div class="receipt-footer">
            This is a computer-generated receipt and does not require a physical signature.<br>
            For any payment-related queries, contact the accounts department.
          </div>
        </div>
      </body>
      </html>
    `);
    receiptWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Loading State */}
        {status === 'loading' && (
          <div className="bg-card rounded-3xl p-10 shadow-xl border border-border text-center animate-pulse">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-10 h-10 text-primary animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">Verifying Payment</h2>
            <p className="text-muted-foreground">Checking payment status with HDFC SmartGateway...</p>
            <p className="text-xs text-muted-foreground mt-4">Order: {orderId}</p>
          </div>
        )}

        {/* Success State */}
        {status === 'success' && (
          <div className="bg-card rounded-3xl shadow-xl border border-border overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-8 text-center text-white">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold mb-1">Payment Successful!</h2>
              <p className="text-emerald-100 text-sm">Your payment has been processed and verified</p>
            </div>

            {/* Details */}
            <div className="p-6 space-y-4">
              <div className="bg-emerald-500/5 border-2 border-emerald-500/20 rounded-2xl p-5 text-center">
                <p className="text-sm text-muted-foreground mb-1">Amount Paid</p>
                <p className="text-4xl font-extrabold text-emerald-600">₹{orderData?.amount || paymentAmount}</p>
              </div>

              <div className="bg-secondary/50 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Student</span>
                  <span className="font-semibold text-foreground">{profile?.full_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">USN</span>
                  <span className="font-mono text-sm font-medium text-foreground">{(profile as any)?.roll_number || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Description</span>
                  <span className="font-medium text-foreground text-right text-sm max-w-[60%]">{paymentDescription || orderData?.due_type}</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Order ID</span>
                  <span className="font-mono text-xs text-foreground">{orderData?.order_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Transaction ID</span>
                  <span className="font-mono text-xs text-foreground max-w-[60%] truncate" title={orderData?.txn_id}>
                    {orderData?.txn_id || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Payment Method</span>
                  <span className="font-medium text-foreground">{orderData?.payment_method || 'Online'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-bold">✅ Charged</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleDownloadReceipt}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 bg-primary text-primary-foreground font-bold rounded-xl transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Receipt
                </button>
                <button
                  onClick={handleGoToDashboard}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 bg-secondary text-foreground font-bold rounded-xl transition-all hover:bg-secondary/80"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Failed State */}
        {status === 'failed' && (
          <div className="bg-card rounded-3xl shadow-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-br from-red-500 to-red-600 p-8 text-center text-white">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <XCircle className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold mb-1">Payment Failed</h2>
              <p className="text-red-100 text-sm">The payment could not be processed</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5">
                <p className="text-sm text-destructive font-medium">
                  {orderData?.hdfc_response?.bank_error_message ||
                   orderData?.hdfc_response?.resp_message ||
                   'Your payment was not successful. Please try again or use a different payment method.'}
                </p>
              </div>

              {orderData?.order_id && (
                <div className="bg-secondary/50 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Order ID</span>
                    <span className="font-mono text-xs">{orderData.order_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="font-bold">₹{orderData.amount || paymentAmount}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleRetry}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 bg-primary text-primary-foreground font-bold rounded-xl transition-all hover:bg-primary/90"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
                <button
                  onClick={handleGoToDashboard}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 bg-secondary text-foreground font-bold rounded-xl transition-all hover:bg-secondary/80"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending State */}
        {status === 'pending' && (
          <div className="bg-card rounded-3xl shadow-xl border border-border overflow-hidden">
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-8 text-center text-white">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Clock className="w-10 h-10 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold mb-1">Payment Processing</h2>
              <p className="text-amber-100 text-sm">Your payment is being processed</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                  Your payment is still being processed by the bank. This may take a few moments.
                  Click "Check Again" to refresh the status.
                </p>
              </div>

              <div className="bg-secondary/50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Order ID</span>
                  <span className="font-mono text-xs">{orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="font-bold">₹{paymentAmount || orderData?.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className="px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-xs font-bold">
                    {orderData?.hdfc_response?.status || 'Processing'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleRetry}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 bg-amber-500 text-white font-bold rounded-xl transition-all hover:bg-amber-600"
                >
                  <RefreshCw className="w-4 h-4" />
                  Check Again
                </button>
                <button
                  onClick={handleGoToDashboard}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 bg-secondary text-foreground font-bold rounded-xl transition-all hover:bg-secondary/80"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="bg-card rounded-3xl p-10 shadow-xl border border-border text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">Something Went Wrong</h2>
            <p className="text-muted-foreground mb-6">{errorMsg || 'Unable to verify payment status.'}</p>
            
            <div className="space-y-3">
              {orderId && (
                <button
                  onClick={handleRetry}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-primary text-primary-foreground font-bold rounded-xl transition-all hover:bg-primary/90"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              )}
              <button
                onClick={handleGoToDashboard}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-secondary text-foreground font-bold rounded-xl transition-all hover:bg-secondary/80"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
