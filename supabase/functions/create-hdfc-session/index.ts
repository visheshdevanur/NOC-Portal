// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

/**
 * HDFC SmartGateway — Create Order via /orders endpoint (Basic Auth)
 * This endpoint successfully creates orders (confirmed in HDFC dashboard)
 */

const HDFC_API_KEY = Deno.env.get('HDFC_API_KEY') || ''
const HDFC_MERCHANT_ID = Deno.env.get('HDFC_MERCHANT_ID') || ''
const HDFC_PAYMENT_PAGE_CLIENT_ID = Deno.env.get('HDFC_PAYMENT_PAGE_CLIENT_ID') || 'hdfcmaster'
const HDFC_BASE_URL = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'
const PAYMENT_RETURN_URL = Deno.env.get('PAYMENT_RETURN_URL') || ''
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

/** Base64 encode for Basic Auth */
function btoa64(str: string): string {
  return btoa(str)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Step 1: Authenticate user via Supabase
    console.log('STEP 1: Auth check')
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
      console.error('Auth failed:', authError?.message)
      return jsonRes({ error: 'Invalid or expired token' }, 401)
    }
    console.log('STEP 1 OK: user =', user.id)

    // Step 2: Parse request
    console.log('STEP 2: Parse request body')
    const body = await req.json()
    const { amount, enrollment_id, enrollment_ids, due_type } = body

    if (!amount || amount <= 0) {
      return jsonRes({ error: 'Valid amount is required' }, 400)
    }

    // Step 3: Get student profile
    console.log('STEP 3: Verify student profile')
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, role, tenant_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile || profile.role !== 'student') {
      return jsonRes({ error: 'Only students can create payment orders' }, 403)
    }

    // Step 4: Generate order ID
    const orderId = generateOrderId()
    console.log('STEP 4: orderId =', orderId)

    // Step 5: Call HDFC /orders endpoint with Basic Auth
    console.log('STEP 5: Call HDFC /orders (Basic Auth)')
    const returnUrl = PAYMENT_RETURN_URL || `${ALLOWED_ORIGIN}/payment/callback`
    const customerIdForHdfc = user.id.replace(/-/g, '').substring(0, 20)
    const authB64 = btoa64(`${HDFC_API_KEY}:`)

    const formParams = new URLSearchParams({
      order_id: orderId,
      amount: Number(amount).toFixed(2),
      customer_id: customerIdForHdfc,
      customer_email: user.email || profile.email || '',
      customer_phone: '9999999999',
      payment_page_client_id: HDFC_PAYMENT_PAGE_CLIENT_ID,
      action: 'paymentPage',
      return_url: returnUrl,
      currency: 'INR',
    })

    const hdfcUrl = `${HDFC_BASE_URL}/orders`
    console.log('HDFC URL:', hdfcUrl)

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
    console.log('HDFC response status:', hdfcResponse.status)
    console.log('HDFC response:', responseText.substring(0, 500))

    if (!hdfcResponse.ok) {
      let errorData: any = {}
      try { errorData = JSON.parse(responseText) } catch {}
      const msg = errorData.error_message || errorData.user_message || `HDFC returned ${hdfcResponse.status}`
      console.error('HDFC API error:', msg)
      return jsonRes({ error: msg, hdfc_error: errorData }, 502)
    }

    let hdfcData: any
    try {
      hdfcData = JSON.parse(responseText)
    } catch {
      return jsonRes({ error: 'Invalid response from payment gateway' }, 502)
    }

    // Extract payment link from response
    const paymentLink = hdfcData?.payment_links?.web || hdfcData?.payment_link
    console.log('STEP 5 OK: status =', hdfcData.status, 'paymentLink =', paymentLink)

    // If no direct payment link, construct one from order
    const finalPaymentLink = paymentLink ||
      `${HDFC_BASE_URL}/pay/${HDFC_PAYMENT_PAGE_CLIENT_ID}/${orderId}`

    // Step 6: Store order in DB
    console.log('STEP 6: Store order in DB')
    const primaryEnrollmentId = enrollment_id || (enrollment_ids?.length > 0 ? enrollment_ids[0] : null)

    const { data: dbOrderId, error: rpcError } = await adminClient.rpc('create_payment_order_atomic', {
      p_student_id: user.id,
      p_enrollment_id: primaryEnrollmentId || null,
      p_amount: amount,
      p_due_type: due_type || 'attendance_fine',
      p_gateway_order_id: orderId,
      p_tenant_id: profile.tenant_id,
      p_gateway_type: 'hdfc',
      p_payment_link: finalPaymentLink,
    })

    if (rpcError) {
      console.error('DB error:', rpcError.message)
      const msg = rpcError.message
      if (msg.includes('already exists')) return jsonRes({ error: 'An unpaid order already exists' }, 409)
      if (msg.includes('already been paid')) return jsonRes({ error: 'This fine has already been paid' }, 400)
      return jsonRes({ error: 'Failed to create payment order: ' + msg }, 500)
    }

    // For bulk payments, store all enrollment_ids in the payment order
    if (enrollment_ids && enrollment_ids.length > 1 && dbOrderId) {
      await adminClient
        .from('payment_orders')
        .update({ enrollment_ids: JSON.stringify(enrollment_ids) })
        .eq('id', dbOrderId)
    }

    console.log('ALL STEPS COMPLETE')
    return jsonRes({
      order_id: orderId,
      payment_link: finalPaymentLink,
      amount: amount,
      hdfc_status: hdfcData.status,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('UNCAUGHT ERROR:', message, error instanceof Error ? error.stack : '')
    return jsonRes({ error: message }, 500)
  }
})
