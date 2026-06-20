// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, log } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Create Order via /orders endpoint (Basic Auth)
 * 
 * FIXED FLOW (DB-first):
 * 1. Authenticate user
 * 2. Parse + validate request
 * 3. Verify student profile
 * 4. Auto-expire stale orders + create DB record atomically
 * 5. Call HDFC /orders to get payment link
 * 6. Update DB record with payment link
 * 
 * This prevents orphaned HDFC orders if DB validation fails.
 */

const HDFC_API_KEY = Deno.env.get('HDFC_API_KEY') || ''
const HDFC_MERCHANT_ID = Deno.env.get('HDFC_MERCHANT_ID') || ''
const HDFC_PAYMENT_PAGE_CLIENT_ID = Deno.env.get('HDFC_PAYMENT_PAGE_CLIENT_ID') || 'hdfcmaster'
const HDFC_BASE_URL = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'
const PAYMENT_RETURN_URL = Deno.env.get('PAYMENT_RETURN_URL') || ''

const corsHeaders = getCorsHeaders()

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `NOC${ts}${rand}`.substring(0, 20)
}

/** Generate a cryptographic random token for IDOR protection */
function generateOrderToken(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin') || '') })
  }

  try {
    // Step 1: Authenticate user via Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonRes({ error: 'Missing Authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = authHeader.replace('Bearer ', '')

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: { user }, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !user) {
      return jsonRes({ error: 'Invalid or expired token' }, 401)
    }

    // Step 2: Parse request
    const body = await req.json()
    const { amount, enrollment_id, enrollment_ids, due_type } = body

    if (!amount || amount <= 0) {
      return jsonRes({ error: 'Valid amount is required' }, 400)
    }

    // Step 3: Get student profile
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, role, tenant_id, full_name, email, phone')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile) {
      return jsonRes({ error: 'User profile not found' }, 403)
    }

    // Step 4: Generate order ID + token
    const orderId = generateOrderId()
    const orderToken = generateOrderToken()

    // Step 5: DB FIRST — Auto-expire stale orders + create record atomically
    // For 'other_dues', enrollment_id is actually an other_due_id — don't pass it as enrollment
    const isOtherDues = due_type === 'other_dues'
    const primaryEnrollmentId = isOtherDues ? null : (enrollment_id || (enrollment_ids?.length > 0 ? enrollment_ids[0] : null))

    // Expire stale 'created' orders older than 3 minutes before creating new one
    // This prevents "unpaid order already exists" errors from abandoned/failed attempts
    await adminClient
      .from('payment_orders')
      .update({ status: 'expired' })
      .eq('student_id', user.id)
      .eq('status', 'created')
      .lt('created_at', new Date(Date.now() - 3 * 60 * 1000).toISOString())

    // Create DB order record
    let dbOrderId: string | null = null

    if (isOtherDues) {
      // For other_dues: direct insert (RPC validates enrollment_id which doesn't apply here)
      const insertPayload: any = {
        student_id: user.id,
        amount: amount,
        due_type: 'other_dues',
        gateway_order_id: orderId,
        tenant_id: profile.tenant_id,
        status: 'created',
      }
      // Only add optional columns if they exist in the schema
      try { insertPayload.gateway_type = 'hdfc' } catch {}
      try { insertPayload.order_token = orderToken } catch {}
      try { insertPayload.metadata = enrollment_id ? { other_due_id: enrollment_id } : null } catch {}

      const { data: insertedOrder, error: insertError } = await adminClient
        .from('payment_orders')
        .insert(insertPayload)
        .select('id')
        .single()

      if (insertError) {
        log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'insert_failed', error: insertError.message })
        return jsonRes({ error: 'Failed to create payment order. Please try again.' }, 500)
      }
      dbOrderId = insertedOrder?.id || null
    } else {
      // For attendance fines: use the validated RPC
      const { data: rpcOrderId, error: rpcError } = await adminClient.rpc('create_payment_order_atomic', {
        p_student_id: user.id,
        p_enrollment_id: primaryEnrollmentId || null,
        p_amount: amount,
        p_due_type: due_type || 'attendance_fine',
        p_gateway_order_id: orderId,
        p_tenant_id: profile.tenant_id,
        p_gateway_type: 'hdfc',
        p_payment_link: null,
      })

      if (rpcError) {
        const msg = rpcError.message
        if (msg.includes('already exists')) return jsonRes({ error: 'An unpaid order already exists' }, 409)
        if (msg.includes('already been paid')) return jsonRes({ error: 'This fine has already been paid' }, 400)
        log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'rpc_failed', error: msg })
        return jsonRes({ error: 'Failed to create payment order. Please try again.' }, 500)
      }
      dbOrderId = rpcOrderId

      // Store order_token for IDOR protection
      if (dbOrderId) {
        await adminClient
          .from('payment_orders')
          .update({ order_token: orderToken })
          .eq('id', dbOrderId)
      }
    }

    // For bulk payments, store all enrollment_ids in the payment order
    if (enrollment_ids && enrollment_ids.length > 0 && dbOrderId) {
      await adminClient
        .from('payment_orders')
        .update({ enrollment_ids: enrollment_ids })
        .eq('id', dbOrderId)
    }

    // Step 6: Now call HDFC /orders endpoint (DB record already created)
    // ── Build return URL (priority order) ──────────────────────────────
    // 1. PAYMENT_RETURN_URL env var (explicit, most reliable — set per environment)
    // 2. Referer header — includes the full path, so we can extract the SPA base (e.g. /nodue/)
    // 3. Origin header — just the origin, must guess the SPA path prefix
    // 4. First value from ALLOWED_ORIGIN env — last resort
    const requestOrigin = req.headers.get('Origin') || ''
    const refererFull  = req.headers.get('Referer') || ''
    const allowedEnv   = Deno.env.get('ALLOWED_ORIGIN') || ''
    // Never use the raw ALLOWED_ORIGIN string as a URL — it may be comma-separated.
    const primaryAllowedOrigin = allowedEnv
      ? allowedEnv.split(',')[0].trim()
      : 'https://mitmysore.in'

    let baseReturnUrl: string
    if (PAYMENT_RETURN_URL) {
      // Explicit env var wins — works for any deployment topology
      baseReturnUrl = PAYMENT_RETURN_URL
    } else {
      try {
        // Use Referer (full URL including path) to detect SPA sub-path like /nodue/
        const ref = refererFull || requestOrigin
        const refUrl = new URL(ref || `https://${primaryAllowedOrigin}`)
        const segments = refUrl.pathname.split('/').filter(Boolean)
        // Treat first path segment as SPA base ONLY if it looks like an app prefix
        // (single short word, not 'dashboard', 'login' etc — specifically 'nodue')
        const spaBase = segments.length > 0 && /^[a-z]{2,10}$/.test(segments[0]) && segments[0] !== 'payment'
          ? `/${segments[0]}`
          : ''
        baseReturnUrl = `${refUrl.origin}${spaBase}/payment/callback`
      } catch {
        baseReturnUrl = `${requestOrigin || primaryAllowedOrigin}/payment/callback`
      }
    }

    // Include order_id in return URL so callback page works even if localStorage is cleared
    const returnUrl = `${baseReturnUrl}?order_id=${orderId}&order_token=${orderToken}`

    const customerIdForHdfc = user.id.replace(/-/g, '').substring(0, 20)
    const authB64 = btoa(`${HDFC_API_KEY}:`)

    const formParams = new URLSearchParams({
      order_id: orderId,
      amount: Number(amount).toFixed(2),
      customer_id: customerIdForHdfc,
      customer_email: user.email || profile.email || `student_${customerIdForHdfc}@noc.in`,
      customer_phone: profile.phone || '9999999999',
      payment_page_client_id: HDFC_PAYMENT_PAGE_CLIENT_ID,
      action: 'paymentPage',
      return_url: returnUrl,
      currency: 'INR',
    })

    const hdfcUrl = `${HDFC_BASE_URL}/orders`

    const hdfcResponse = await fetch(hdfcUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authB64}`,
        'x-merchantid': HDFC_MERCHANT_ID,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formParams.toString(),
    })

    const responseText = await hdfcResponse.text()

    if (!hdfcResponse.ok) {
      // HDFC call failed — mark DB order as failed so it doesn't block new orders
      if (dbOrderId) {
        await adminClient
          .from('payment_orders')
          .update({ status: 'failed' })
          .eq('id', dbOrderId)
      }
      let errorData: any = {}
      try { errorData = JSON.parse(responseText) } catch {}
      const msg = errorData.error_message || errorData.user_message || `Payment gateway error`
      log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'hdfc_failed', error: msg })
      return jsonRes({ error: 'Payment gateway error. Please try again.' }, 502)
    }

    let hdfcData: any
    try {
      hdfcData = JSON.parse(responseText)
    } catch {
      return jsonRes({ error: 'Invalid response from payment gateway' }, 502)
    }

    // Extract payment link from response
    const paymentLink = hdfcData?.payment_links?.web || hdfcData?.payment_link

    // If no direct payment link, construct one from order
    const finalPaymentLink = paymentLink ||
      `${HDFC_BASE_URL}/pay/${HDFC_PAYMENT_PAGE_CLIENT_ID}/${orderId}`

    // Step 7: Update DB record with payment link
    if (dbOrderId) {
      await adminClient
        .from('payment_orders')
        .update({ payment_link: finalPaymentLink })
        .eq('id', dbOrderId)
    }

    log({ level: 'INFO', fn: 'create-hdfc-session', action: 'order_created', meta: { orderId } })
    return jsonRes({
      order_id: orderId,
      order_token: orderToken,
      payment_link: finalPaymentLink,
      amount: amount,
      hdfc_status: hdfcData.status,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'unhandled', error: message })
    // S-21: Don't leak internal error details to client
    return jsonRes({ error: 'An unexpected error occurred. Please try again.' }, 500)
  }
})
