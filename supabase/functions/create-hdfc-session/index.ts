// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

/**
 * HDFC SmartGateway — Session API
 * Creates payment order + calls HDFC to get payment link
 */

const HDFC_API_KEY = Deno.env.get('HDFC_API_KEY') || ''
const HDFC_MERCHANT_ID = Deno.env.get('HDFC_MERCHANT_ID') || ''
const HDFC_RESELLER_ID = Deno.env.get('HDFC_RESELLER_ID') || 'hdfc_reseller'
const HDFC_PAYMENT_PAGE_CLIENT_ID = Deno.env.get('HDFC_PAYMENT_PAGE_CLIENT_ID') || ''
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
  return `NOC${ts}${rand}`.substring(0, 21)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
      console.error('STEP 1 FAILED:', authError?.message)
      return jsonRes({ error: 'Invalid or expired token', detail: authError?.message }, 401)
    }
    console.log('STEP 1 OK: user =', user.id)

    console.log('STEP 2: Parse request body')
    const body = await req.json()
    const { amount, enrollment_id, enrollment_ids, due_type } = body
    console.log('STEP 2 OK:', JSON.stringify({ amount, enrollment_id, due_type }))

    if (!amount || amount <= 0) {
      return jsonRes({ error: 'Valid amount is required' }, 400)
    }

    console.log('STEP 3: Verify student profile')
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, role, tenant_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (profileErr) {
      console.error('STEP 3 FAILED:', profileErr.message)
      return jsonRes({ error: 'Profile fetch failed: ' + profileErr.message }, 500)
    }
    if (!profile || profile.role !== 'student') {
      return jsonRes({ error: 'Only students can create payment orders' }, 403)
    }
    console.log('STEP 3 OK: profile =', profile.full_name)

    console.log('STEP 4: Generate order ID')
    const orderId = generateOrderId()
    console.log('STEP 4 OK: orderId =', orderId)

    console.log('STEP 5: Call HDFC Session API')
    if (!HDFC_API_KEY) {
      return jsonRes({ error: 'Payment gateway not configured. Contact administrator.' }, 503)
    }

    const hdfcAuth = `Basic ${btoa(`${HDFC_API_KEY}:`)}`
    const customerIdForHdfc = user.id.replace(/-/g, '').substring(0, 20)
    const returnUrl = PAYMENT_RETURN_URL || `${ALLOWED_ORIGIN}/payment/callback`

    const sessionPayload = {
      order_id: orderId,
      amount: String(Number(amount).toFixed(2)),
      customer_id: customerIdForHdfc,
      customer_email: user.email || profile.email || '',
      customer_phone: '',
      payment_page_client_id: HDFC_PAYMENT_PAGE_CLIENT_ID,
      action: 'paymentPage',
      return_url: returnUrl,
      description: `NOC Portal - Attendance Fine Payment`,
    }

    console.log('STEP 5: Calling', `${HDFC_BASE_URL}/v4/session`)
    console.log('STEP 5: Headers x-merchantid =', HDFC_MERCHANT_ID, ', x-resellerid =', HDFC_RESELLER_ID)
    console.log('STEP 5: Payload =', JSON.stringify(sessionPayload))

    const sessionResponse = await fetch(`${HDFC_BASE_URL}/v4/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': hdfcAuth,
        'x-merchantid': HDFC_MERCHANT_ID,
        'x-customerid': customerIdForHdfc,
        'x-resellerid': HDFC_RESELLER_ID,
      },
      body: JSON.stringify(sessionPayload),
    })

    const sessionText = await sessionResponse.text()
    console.log('STEP 5: HDFC response status =', sessionResponse.status)
    console.log('STEP 5: HDFC response body =', sessionText)

    let sessionData: any
    try {
      sessionData = JSON.parse(sessionText)
    } catch {
      console.error('STEP 5 FAILED: Could not parse HDFC response as JSON')
      return jsonRes({ error: 'Invalid response from payment gateway', raw: sessionText.substring(0, 200) }, 502)
    }

    if (!sessionResponse.ok || !sessionData.payment_links?.web) {
      console.error('STEP 5 FAILED: No payment link in response')
      const errorMsg = sessionData?.error_message || sessionData?.status || 'Failed to create payment session'
      return jsonRes({ error: errorMsg, hdfc_status: sessionData?.status }, 502)
    }

    const paymentLink = sessionData.payment_links.web
    console.log('STEP 5 OK: paymentLink =', paymentLink)

    console.log('STEP 6: Store order in DB')
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
      console.error('STEP 6 FAILED:', rpcError.message)
      const msg = rpcError.message
      if (msg.includes('already exists')) return jsonRes({ error: 'An unpaid order already exists for this fine' }, 409)
      if (msg.includes('already been paid')) return jsonRes({ error: 'This fine has already been paid' }, 400)
      if (msg.includes('does not match')) return jsonRes({ error: msg }, 400)
      if (msg.includes('not found')) return jsonRes({ error: 'Enrollment not found or does not belong to you' }, 404)
      return jsonRes({ error: 'Failed to create payment order: ' + msg }, 500)
    }
    console.log('STEP 6 OK: order stored, id =', dbOrderId)

    console.log('ALL STEPS COMPLETE — returning success')
    return jsonRes({
      order_id: orderId,
      payment_link: paymentLink,
      amount: amount,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const stack = error instanceof Error ? error.stack : ''
    console.error('UNCAUGHT ERROR:', message, stack)
    return jsonRes({ error: message }, 500)
  }
})
