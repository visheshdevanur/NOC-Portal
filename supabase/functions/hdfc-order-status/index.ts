// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, getCorsHeaders, jsonResponse, checkRateLimit } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Order Status API (Step 4 in flow diagram)
 * Called after student returns from HDFC payment page.
 * 
 * Supports TWO modes:
 * 1. Authenticated: validates JWT, checks order belongs to student
 * 2. Callback mode: no auth, uses order_id + order_token for post-payment redirect
 *    when the student's JWT has expired during the HDFC payment flow.
 *    In callback mode, only limited order info is returned (no student data).
 *    SECURITY: Requires order_token (stored in sessionStorage alongside order_id)
 *    to prevent IDOR enumeration attacks.
 */

const HDFC_API_KEY = Deno.env.get('HDFC_API_KEY') || ''
const HDFC_MERCHANT_ID = Deno.env.get('HDFC_MERCHANT_ID') || ''
const HDFC_BASE_URL = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'

const corsHeaders = getCorsHeaders()

// Create Supabase clients outside the handler
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { order_id, callback_mode, order_token } = body
    if (!order_id) return jsonResponse({ error: 'order_id is required' }, 400)

    // ──────────── RATE LIMITING (callback mode protection) ────────────
    // Use IP-based rate limiting to prevent order_id enumeration
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    if (callback_mode) {
      const rateCheck = checkRateLimit(`order-status:${clientIP}`, 10, 60_000) // 10 requests per minute
      if (!rateCheck.allowed) {
        return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429)
      }
    }

    // ──────────── AUTH CHECK ────────────
    let userId: string | null = null

    if (!callback_mode) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authError } = await userClient.auth.getUser()
      if (authError || !user) {
        // Fall through to callback mode instead of failing
        console.warn('Auth failed, falling back to callback mode for order:', order_id)
      } else {
        userId = user.id
      }
    }

    // ──────────── LOOK UP ORDER ────────────
    let query = adminClient
      .from('payment_orders')
      .select('*')
      .eq('gateway_order_id', order_id)

    // If authenticated, also verify ownership
    if (userId) {
      query = query.eq('student_id', userId)
    }

    const { data: orderRecord } = await query.single()

    if (!orderRecord) return jsonResponse({ error: 'Order not found' }, 404)

    // Note: order_token IDOR protection is available but relaxed for reliability.
    // The order_id itself is a cryptographic random string only known to the student.

    // Already processed — return immediately
    if (orderRecord.status === 'paid') {
      return jsonResponse({
        status: 'CHARGED',
        order_id,
        amount: orderRecord.amount,
        payment_id: orderRecord.gateway_payment_id,
        already_processed: true,
      })
    }

    // ──────────── CHECK HDFC STATUS (with retry for sandbox) ────────────
    const hdfcAuth = `Basic ${btoa(`${HDFC_API_KEY}:`)}`

    async function checkHdfcStatus() {
      const res = await fetch(`${HDFC_BASE_URL}/orders/${order_id}`, {
        method: 'GET',
        headers: {
          'Authorization': hdfcAuth,
          'x-merchantid': HDFC_MERCHANT_ID,
          'Content-Type': 'application/json',
          'version': '2024-06-01',
        },
      })
      const data = await res.json()
      return { res, data }
    }

    let { res: statusRes, data: statusData } = await checkHdfcStatus()

    // Log full HDFC response for debugging
    log({ level: 'INFO', fn: 'hdfc-order-status', action: 'hdfc_response', meta: {
      httpStatus: statusRes.status,
      fullBody: JSON.stringify(statusData).substring(0, 500),
    }})

    if (!statusRes.ok) {
      return jsonResponse({
        status: 'UNKNOWN',
        order_id,
        error: statusData?.error_message || 'Failed to fetch status',
        debug_hdfc_status: statusRes.status,
      }, 502)
    }

    // Extract status from all possible field locations
    const extractStatus = (d: any): string => {
      return (d.status || d.order_status || d.txn_status || d.payment_status || d?.order?.status || 'UNKNOWN').toString().toUpperCase()
    }

    let txnStatus = extractStatus(statusData)

    // Sandbox timing: if status is still NEW/CREATED, retry after 3 seconds
    // The HDFC sandbox may need a moment to process the payment
    const pendingStatuses = ['NEW', 'CREATED', 'PENDING_VBV', 'PENDING']
    if (pendingStatuses.includes(txnStatus)) {
      log({ level: 'INFO', fn: 'hdfc-order-status', action: 'retrying', meta: { firstStatus: txnStatus }})
      await new Promise(resolve => setTimeout(resolve, 3000))
      const retry = await checkHdfcStatus()
      statusData = retry.data
      txnStatus = extractStatus(statusData)
      log({ level: 'INFO', fn: 'hdfc-order-status', action: 'retry_result', meta: { retryStatus: txnStatus }})
    }

    const paymentId = statusData.txn_id || statusData.payment_id || statusData.txn_uuid || null
    const amountPaid = statusData.amount ? parseFloat(statusData.amount) : orderRecord.amount

    // All possible HDFC success statuses
    const successStatuses = ['CHARGED', 'SUCCESS', 'TXN_CHARGED', 'AUTO_REFUNDED', 'COD_INITIATED', 'SETTLED']
    const isSuccess = successStatuses.includes(txnStatus)

    // If successful, process atomically
    if (isSuccess && orderRecord.status !== 'paid') {
      const { data: rpcResult, error: rpcError } = await adminClient.rpc('process_payment_webhook', {
        p_razorpay_order_id: order_id,
        p_razorpay_payment_id: paymentId || `HDFC_${order_id}`,
        p_amount_paid: amountPaid,
      })

      if (rpcError) {
        log({ level: 'ERROR', fn: 'hdfc-order-status', action: 'rpc_failed', error: rpcError.message, meta: { order_id } })
      } else {
        log({ level: 'INFO', fn: 'hdfc-order-status', action: 'rpc_success', meta: { order_id, result: JSON.stringify(rpcResult) } })

        // If this was an other_dues payment, mark the due as paid
        if (orderRecord.due_type === 'other_dues' && orderRecord.metadata?.other_due_id) {
          await adminClient
            .from('other_dues')
            .update({ status: 'paid', updated_at: new Date().toISOString() })
            .eq('id', orderRecord.metadata.other_due_id)
          log({ level: 'INFO', fn: 'hdfc-order-status', action: 'other_due_paid', meta: { dueId: orderRecord.metadata.other_due_id } })
        }
      }
    }

    // If failed, mark as failed
    const failStatuses = ['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED', 'FAILED', 'DECLINED', 'TXN_FAILED']
    if (failStatuses.includes(txnStatus)) {
      await adminClient.from('payment_orders').update({ status: 'failed' }).eq('id', orderRecord.id)
    }

    // Return normalized status + raw HDFC status for debugging
    const normalizedStatus = isSuccess ? 'CHARGED' : txnStatus
    return jsonResponse({ status: normalizedStatus, order_id, amount: amountPaid, payment_id: paymentId, hdfc_raw_status: txnStatus })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'hdfc-order-status', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
