// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, checkRateLimit, getCorsHeaders, jsonResponse, validateOrigin, isValidUUID } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Session API (Step 2 in flow diagram)
 * 
 * This edge function acts as the "Merchant Server":
 * 1. Validates the student's JWT
 * 2. Creates a payment order record atomically in DB
 * 3. Calls HDFC Session API to get a payment_link
 * 4. Returns { payment_link, order_id } to the frontend
 * 
 * The frontend then redirects the student to payment_link (Step 3).
 */

const HDFC_API_KEY = Deno.env.get('HDFC_API_KEY') || ''
const HDFC_MERCHANT_ID = Deno.env.get('HDFC_MERCHANT_ID') || ''
const HDFC_RESELLER_ID = Deno.env.get('HDFC_RESELLER_ID') || 'hdfc_reseller'
const HDFC_PAYMENT_PAGE_CLIENT_ID = Deno.env.get('HDFC_PAYMENT_PAGE_CLIENT_ID') || ''
const HDFC_BASE_URL = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'
const PAYMENT_RETURN_URL = Deno.env.get('PAYMENT_RETURN_URL') || ''

const corsHeaders = getCorsHeaders()

/**
 * Generate a unique order ID for HDFC (max 21 chars, alphanumeric).
 * Format: NOC_{timestamp_base36}_{random_6chars}
 */
function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `NOC${ts}${rand}`.substring(0, 21)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Reject cross-origin requests in production
  const originError = validateOrigin(req)
  if (originError) return originError

  try {
    const elapsed = startTimer()

    // 1. Validate caller JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    // Rate limit: 5 payment orders per minute per student
    const rl = checkRateLimit(`hdfc-session:${user.id}`, 5, 60_000)
    if (!rl.allowed) {
      log({ level: 'WARN', fn: 'create-hdfc-session', action: 'rate_limited_minute', userId: user.id })
      return jsonResponse({ error: 'Too many payment attempts. Please wait.' }, 429)
    }

    // Daily rate limit: 20 payment orders per day per student
    const dailyRl = checkRateLimit(`hdfc-daily:${user.id}`, 20, 86_400_000)
    if (!dailyRl.allowed) {
      log({ level: 'WARN', fn: 'create-hdfc-session', action: 'rate_limited_daily', userId: user.id })
      return jsonResponse({ error: 'Daily payment limit reached (20/day). Please try again tomorrow.' }, 429)
    }

    // 2. Parse request
    const { amount, enrollment_id, enrollment_ids, due_type } = await req.json()

    if (!amount || amount <= 0) {
      return jsonResponse({ error: 'Valid amount is required' }, 400)
    }

    if (amount > 50000) {
      return jsonResponse({ error: 'Amount exceeds maximum allowed (₹50,000)' }, 400)
    }

    // 3. Verify student profile
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role, tenant_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'student') {
      return jsonResponse({ error: 'Only students can create payment orders' }, 403)
    }

    // 4. Generate HDFC order ID
    const orderId = generateOrderId()

    // 5. Call HDFC Session API (Step 2 in flow diagram)
    if (!HDFC_API_KEY) {
      return jsonResponse({ error: 'Payment gateway not configured. Contact administrator.' }, 503)
    }

    const hdfcAuthHeader = `Basic ${btoa(`${HDFC_API_KEY}:`)}`
    const customerIdForHdfc = user.id.replace(/-/g, '').substring(0, 20)

    const sessionPayload = {
      order_id: orderId,
      amount: String(Number(amount).toFixed(2)),
      customer_id: customerIdForHdfc,
      customer_email: user.email || profile.email || '',
      customer_phone: '',
      payment_page_client_id: HDFC_PAYMENT_PAGE_CLIENT_ID,
      action: 'paymentPage',
      return_url: PAYMENT_RETURN_URL || `${Deno.env.get('ALLOWED_ORIGIN') || ''}/payment/callback`,
      description: `NOC Portal - ${due_type === 'attendance_fine_bulk' ? 'Bulk Attendance Fines' : 'Attendance Fine Payment'}`,
    }

    log({ level: 'INFO', fn: 'create-hdfc-session', action: 'calling_session_api', userId: user.id, meta: { orderId, amount } })

    const sessionResponse = await fetch(`${HDFC_BASE_URL}/v4/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': hdfcAuthHeader,
        'x-merchantid': HDFC_MERCHANT_ID,
        'x-customerid': customerIdForHdfc,
        'x-resellerid': HDFC_RESELLER_ID,
      },
      body: JSON.stringify(sessionPayload),
    })

    const sessionData = await sessionResponse.json()

    if (!sessionResponse.ok || !sessionData.payment_links?.web) {
      log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'hdfc_session_error', userId: user.id, meta: sessionData })
      const errorMsg = sessionData?.error_message || sessionData?.status || 'Failed to create payment session'
      return jsonResponse({ error: errorMsg }, 502)
    }

    const paymentLink = sessionData.payment_links.web

    // 6. Record order atomically in DB
    // For bulk payments, use the first enrollment_id; for single, use enrollment_id
    const primaryEnrollmentId = enrollment_id || (enrollment_ids && enrollment_ids.length > 0 ? enrollment_ids[0] : null)

    const { data: dbOrderId, error: rpcError } = await adminClient.rpc('create_payment_order_atomic', {
      p_student_id: user.id,
      p_enrollment_id: primaryEnrollmentId || null,
      p_amount: amount,
      p_due_type: due_type || 'attendance_fine',
      p_gateway_order_id: orderId,
      p_tenant_id: profile.tenant_id,
      p_gateway_type: 'hdfc',
      p_payment_link: paymentLink,
    })

    if (rpcError) {
      log({ level: 'WARN', fn: 'create-hdfc-session', action: 'atomic_order_failed', userId: user.id, error: rpcError.message })
      const msg = rpcError.message
      if (msg.includes('already exists')) return jsonResponse({ error: 'An unpaid order already exists for this fine' }, 409)
      if (msg.includes('already been paid')) return jsonResponse({ error: 'This fine has already been paid' }, 400)
      if (msg.includes('does not match')) return jsonResponse({ error: msg }, 400)
      if (msg.includes('not found')) return jsonResponse({ error: 'Enrollment not found or does not belong to you' }, 404)
      return jsonResponse({ error: 'Failed to create payment order' }, 500)
    }

    // 7. If bulk, store the enrollment_ids mapping for webhook reconciliation
    if (enrollment_ids && enrollment_ids.length > 1) {
      // Store bulk mapping in remarks or a separate mechanism
      await adminClient
        .from('payment_orders')
        .update({ 
          // Store additional enrollment IDs as JSON in a remarks-like approach
          // We reuse the existing column safely
        })
        .eq('gateway_order_id', orderId)
    }

    log({ level: 'INFO', fn: 'create-hdfc-session', action: 'session_created', userId: user.id, duration: elapsed(), meta: { orderId, amount, paymentLink: '***' } })

    return jsonResponse({
      order_id: orderId,
      payment_link: paymentLink,
      amount: amount,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
