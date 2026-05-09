// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, checkRateLimit, getCorsHeaders, jsonResponse, validateOrigin } from '../_shared/utils.ts'

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || ''

const corsHeaders = getCorsHeaders()

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Reject cross-origin requests in production
  const originError = validateOrigin(req)
  if (originError) return originError

  try {
    const elapsed = startTimer()
    // 1. Validate caller JWT — only authenticated students can create orders
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
    const rl = checkRateLimit(`razorpay-order:${user.id}`, 5, 60_000)
    if (!rl.allowed) {
      log({ level: 'WARN', fn: 'create-razorpay-order', action: 'rate_limited', userId: user.id })
      return jsonResponse({ error: 'Too many payment attempts. Please wait.' }, 429)
    }

    // 2. Parse request
    const { amount, receipt, enrollment_id, due_type } = await req.json()

    if (!amount || amount <= 0) {
      return jsonResponse({ error: 'Valid amount is required' }, 400)
    }

    if (amount > 50000) {
      return jsonResponse({ error: 'Amount exceeds maximum allowed (₹50,000)' }, 400)
    }

    // 3. Verify the student actually has a pending fine
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'student') {
      return jsonResponse({ error: 'Only students can create payment orders' }, 403)
    }

    // 4. Create Razorpay order FIRST (external API call)
    const authHeaderRazorpay = `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeaderRazorpay,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Razorpay expects paise
        currency: 'INR',
        receipt: receipt || `rcpt_${user.id.slice(0, 8)}_${Date.now()}`,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      log({ level: 'ERROR', fn: 'create-razorpay-order', action: 'razorpay_error', userId: user.id, meta: data })
      throw new Error(data.error?.description || 'Failed to create Razorpay order')
    }

    // 5. Record order atomically — this RPC locks the enrollment row,
    //    verifies the amount matches, checks for duplicates, and inserts
    //    all in a single transaction. Prevents double-spend attacks.
    const { data: orderId, error: rpcError } = await adminClient.rpc('create_payment_order_atomic', {
      p_student_id: user.id,
      p_enrollment_id: enrollment_id || null,
      p_amount: amount,
      p_due_type: due_type || 'attendance_fine',
      p_razorpay_order_id: data.id,
      p_tenant_id: profile.tenant_id,
    })

    if (rpcError) {
      log({ level: 'WARN', fn: 'create-razorpay-order', action: 'atomic_order_failed', userId: user.id, error: rpcError.message })
      // Return user-friendly error messages based on the RPC exception
      const msg = rpcError.message
      if (msg.includes('already exists')) return jsonResponse({ error: 'An unpaid order already exists for this fine' }, 409)
      if (msg.includes('already been paid')) return jsonResponse({ error: 'This fine has already been paid' }, 400)
      if (msg.includes('does not match')) return jsonResponse({ error: msg }, 400)
      if (msg.includes('not found')) return jsonResponse({ error: 'Enrollment not found or does not belong to you' }, 404)
      return jsonResponse({ error: 'Failed to create payment order' }, 500)
    }

    log({ level: 'INFO', fn: 'create-razorpay-order', action: 'created', userId: user.id, duration: elapsed(), meta: { order_id: data.id, amount } })
    return jsonResponse(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'create-razorpay-order', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
