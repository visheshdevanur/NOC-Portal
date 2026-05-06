// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, checkRateLimit, getCorsHeaders, jsonResponse } from '../_shared/utils.ts'

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || ''

const corsHeaders = getCorsHeaders()

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    // 3. Verify the student actually has a pending fine of this amount
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'student') {
      return jsonResponse({ error: 'Only students can create payment orders' }, 403)
    }

    // FIX #31: Verify amount matches actual fine in database
    if (enrollment_id && (!due_type || due_type === 'attendance_fine')) {
      const { data: enrollment } = await adminClient
        .from('subject_enrollment')
        .select('attendance_fee, attendance_fee_verified')
        .eq('id', enrollment_id)
        .eq('student_id', user.id)
        .single()

      if (!enrollment) {
        return jsonResponse({ error: 'Enrollment not found or does not belong to you' }, 404)
      }
      if (enrollment.attendance_fee_verified) {
        return jsonResponse({ error: 'This fine has already been paid' }, 400)
      }
      if (Math.abs(amount - enrollment.attendance_fee) > 0.01) {
        log({ level: 'WARN', fn: 'create-razorpay-order', action: 'amount_mismatch', userId: user.id, meta: { requested: amount, actual: enrollment.attendance_fee } })
        return jsonResponse({ error: `Amount ₹${amount} does not match fine ₹${enrollment.attendance_fee}` }, 400)
      }
    } else if (due_type === 'college_fee') {
      const { data: dues } = await adminClient
        .from('student_dues')
        .select('fine_amount, paid_amount, status')
        .eq('student_id', user.id)
        .eq('status', 'pending')

      const totalDue = (dues || []).reduce((sum: number, d: any) => sum + (d.fine_amount - (d.paid_amount || 0)), 0)
      if (totalDue <= 0) {
        return jsonResponse({ error: 'No pending dues found' }, 400)
      }
      if (Math.abs(amount - totalDue) > 0.01) {
        log({ level: 'WARN', fn: 'create-razorpay-order', action: 'amount_mismatch', userId: user.id, meta: { requested: amount, actual: totalDue } })
        return jsonResponse({ error: `Amount ₹${amount} does not match outstanding dues ₹${totalDue}` }, 400)
      }
    }

    // 4. Create Razorpay order
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
      console.error('Razorpay error:', data)
      throw new Error(data.error?.description || 'Failed to create Razorpay order')
    }

    // 5. Record the order in our database for webhook reconciliation
    await adminClient.from('payment_orders').insert({
      razorpay_order_id: data.id,
      student_id: user.id,
      enrollment_id: enrollment_id || null,
      due_type: due_type || 'attendance_fine',
      amount: amount,
      status: 'created',
      tenant_id: profile.tenant_id,
    })

    log({ level: 'INFO', fn: 'create-razorpay-order', action: 'created', userId: user.id, duration: elapsed(), meta: { order_id: data.id, amount } })
    return jsonResponse(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'create-razorpay-order', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
