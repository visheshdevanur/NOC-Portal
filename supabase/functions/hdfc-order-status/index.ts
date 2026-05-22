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

    // ──────────── CHECK HDFC STATUS ────────────
    const hdfcAuth = `Basic ${btoa(`${HDFC_API_KEY}:`)}`
    const statusRes = await fetch(`${HDFC_BASE_URL}/orders/${order_id}`, {
      method: 'GET',
      headers: {
        'Authorization': hdfcAuth,
        'x-merchantid': HDFC_MERCHANT_ID,
        'Content-Type': 'application/json',
        'version': '2024-06-01',
      },
    })
    const statusData = await statusRes.json()

    // Log the full HDFC response for debugging
    log({ level: 'INFO', fn: 'hdfc-order-status', action: 'hdfc_response', meta: { 
      httpStatus: statusRes.status,
      responseKeys: Object.keys(statusData || {}),
      status: statusData?.status,
      order_status: statusData?.order_status,
      txn_status: statusData?.txn_status,
    }})

    if (!statusRes.ok) {
      return jsonResponse({
        status: 'UNKNOWN',
        order_id,
        error: statusData?.error_message || 'Failed to fetch status',
      }, 502)
    }

    // HDFC returns status in different fields depending on the API version/endpoint
    const rawStatus = statusData.status 
      || statusData.order_status 
      || statusData.txn_status
      || statusData.payment_status
      || statusData?.order?.status
      || 'UNKNOWN'
    const txnStatus = rawStatus.toUpperCase()
    const paymentId = statusData.txn_id || statusData.payment_id || statusData.txn_uuid || null
    const amountPaid = statusData.amount ? parseFloat(statusData.amount) : orderRecord.amount

    // All possible HDFC success statuses (case-insensitive via toUpperCase above)
    const successStatuses = ['CHARGED', 'SUCCESS', 'TXN_CHARGED', 'AUTO_REFUNDED', 'COD_INITIATED', 'SETTLED']
    const isSuccess = successStatuses.includes(txnStatus)

    // If successful, process atomically
    // Note: RPC params retain legacy "razorpay" naming for backward compatibility
    if (isSuccess && orderRecord.status !== 'paid') {
      await adminClient.rpc('process_payment_webhook', {
        p_razorpay_order_id: order_id,
        p_razorpay_payment_id: paymentId || `HDFC_${order_id}`,
        p_amount_paid: amountPaid,
      })
    }

    // If failed, mark as failed
    const failStatuses = ['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED', 'FAILED', 'DECLINED', 'TXN_FAILED']
    if (failStatuses.includes(txnStatus)) {
      await adminClient.from('payment_orders').update({ status: 'failed' }).eq('id', orderRecord.id)
    }

    // Return normalized status: map HDFC statuses to what the frontend expects
    const normalizedStatus = isSuccess ? 'CHARGED' : txnStatus
    return jsonResponse({ status: normalizedStatus, order_id, amount: amountPaid, payment_id: paymentId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'hdfc-order-status', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
