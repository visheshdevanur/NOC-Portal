// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, checkRateLimit, getCorsHeaders, jsonResponse, validateOrigin } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Create Payment Session
 * 
 * Handles 3 due types:
 *   - attendance_fine       (single enrollment)
 *   - attendance_fine_bulk  (multiple enrollments)
 *   - other_dues            (single other_dues row)
 *
 * Flow:
 *   1. Validate caller JWT (must be a student)
 *   2. Verify enrollment(s) exist and have unpaid fines
 *   3. Call HDFC Session API (POST /session)
 *   4. Insert payment_orders row
 *   5. Return { payment_link, order_id, amount }
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin') || '') })
  }

  const originError = validateOrigin(req)
  if (originError) return originError

  try {
    const elapsed = startTimer()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ── Auth ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401, undefined, req.headers.get('Origin') || '')
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !caller) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401, undefined, req.headers.get('Origin') || '')
    }

    // Rate limit: 10 sessions per minute per student
    const rl = checkRateLimit(`hdfc-session:${caller.id}`, 10, 60_000)
    if (!rl.allowed) {
      log({ level: 'WARN', fn: 'create-hdfc-session', action: 'rate_limited', userId: caller.id })
      return jsonResponse({ error: 'Too many payment attempts. Please wait a moment.' }, 429, {
        'Retry-After': String(Math.ceil(rl.resetMs / 1000)),
      }, req.headers.get('Origin') || '')
    }

    // ── Get caller profile ──
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, email, full_name, role, roll_number')
      .eq('id', caller.id)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 403, undefined, req.headers.get('Origin') || '')
    }

    if (profile.role !== 'student') {
      return jsonResponse({ error: 'Only students can make payments' }, 403, undefined, req.headers.get('Origin') || '')
    }

    // ── Parse request body ──
    const body = await req.json()
    const { amount, enrollment_id, enrollment_ids, due_type } = body

    if (!amount || amount <= 0) {
      return jsonResponse({ error: 'Invalid amount' }, 400, undefined, req.headers.get('Origin') || '')
    }

    if (!due_type) {
      return jsonResponse({ error: 'due_type is required' }, 400, undefined, req.headers.get('Origin') || '')
    }

    // ── Validate enrollments / dues ──
    let enrollmentIdList: string[] = []

    if (due_type === 'attendance_fine') {
      if (!enrollment_id) {
        return jsonResponse({ error: 'enrollment_id is required' }, 400, undefined, req.headers.get('Origin') || '')
      }
      // Verify this enrollment belongs to the student and has an unpaid fine
      const { data: enrollment } = await adminClient
        .from('subject_enrollment')
        .select('id, attendance_fee, attendance_fee_verified')
        .eq('id', enrollment_id)
        .eq('student_id', caller.id)
        .single()

      if (!enrollment) {
        return jsonResponse({ error: 'Enrollment not found' }, 404, undefined, req.headers.get('Origin') || '')
      }
      if (!enrollment.attendance_fee || enrollment.attendance_fee <= 0) {
        return jsonResponse({ error: 'No fine on this enrollment' }, 400, undefined, req.headers.get('Origin') || '')
      }
      if (enrollment.attendance_fee_verified) {
        return jsonResponse({ error: 'Fine already paid' }, 400, undefined, req.headers.get('Origin') || '')
      }
      enrollmentIdList = [enrollment_id]

    } else if (due_type === 'attendance_fine_bulk') {
      if (!enrollment_ids || !Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
        return jsonResponse({ error: 'enrollment_ids array is required' }, 400, undefined, req.headers.get('Origin') || '')
      }
      // Verify all enrollments belong to student and have unpaid fines
      const { data: enrollments } = await adminClient
        .from('subject_enrollment')
        .select('id, attendance_fee, attendance_fee_verified')
        .in('id', enrollment_ids)
        .eq('student_id', caller.id)

      if (!enrollments || enrollments.length !== enrollment_ids.length) {
        return jsonResponse({ error: 'Some enrollments not found' }, 404, undefined, req.headers.get('Origin') || '')
      }
      const alreadyPaid = enrollments.filter(e => e.attendance_fee_verified)
      if (alreadyPaid.length > 0) {
        return jsonResponse({ error: `${alreadyPaid.length} fine(s) already paid` }, 400, undefined, req.headers.get('Origin') || '')
      }
      enrollmentIdList = enrollment_ids

    } else if (due_type === 'other_dues') {
      if (!enrollment_id) {
        return jsonResponse({ error: 'due_id (enrollment_id) is required' }, 400, undefined, req.headers.get('Origin') || '')
      }
      // Verify this other_due belongs to the student and is pending
      const { data: due } = await adminClient
        .from('other_dues')
        .select('id, amount, status')
        .eq('id', enrollment_id)
        .eq('student_id', caller.id)
        .single()

      if (!due) {
        return jsonResponse({ error: 'Due not found' }, 404, undefined, req.headers.get('Origin') || '')
      }
      if (due.status === 'paid') {
        return jsonResponse({ error: 'Due already paid' }, 400, undefined, req.headers.get('Origin') || '')
      }
      enrollmentIdList = [enrollment_id]

    } else {
      return jsonResponse({ error: 'Invalid due_type' }, 400, undefined, req.headers.get('Origin') || '')
    }

    // ── Generate unique order_id ──
    const shortUuid = crypto.randomUUID().replace(/-/g, '').substring(0, 8)
    const timestamp = Date.now()
    const orderId = `NOC-${shortUuid}-${timestamp}`

    // ── HDFC credentials from env ──
    const hdfcApiKey = Deno.env.get('HDFC_API_KEY')
    const hdfcMerchantId = Deno.env.get('HDFC_MERCHANT_ID')
    const hdfcClientId = Deno.env.get('HDFC_PAYMENT_PAGE_CLIENT_ID')
    const hdfcBaseUrl = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'

    if (!hdfcApiKey || !hdfcMerchantId || !hdfcClientId) {
      log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'missing_env', error: 'HDFC env vars not set' })
      return jsonResponse({ error: 'Payment service not configured' }, 500, undefined, req.headers.get('Origin') || '')
    }

    // ── Build return URL ──
    // Priority: PAYMENT_RETURN_URL env > derive from Referer header > Vercel default
    let returnUrl = Deno.env.get('PAYMENT_RETURN_URL') || ''
    if (!returnUrl) {
      const referer = req.headers.get('Referer') || req.headers.get('Origin') || ''
      if (referer) {
        const url = new URL(referer)
        returnUrl = `${url.origin}/payment/callback`
      } else {
        returnUrl = 'https://noc-portal-self.vercel.app/payment/callback'
      }
    }

    // ── Customer ID: last 20 chars of UUID (HDFC limit) ──
    const customerId = caller.id.replace(/-/g, '').substring(0, 20)

    // ── Call HDFC Session API ──
    // POST /session with Basic Auth
    // Ensure amount >= 1.00 for sandbox simulators
    const sanitizedAmount = Math.max(Number(amount), 1)
    const sessionPayload = {
      order_id: orderId,
      amount: String(sanitizedAmount.toFixed(2)),
      currency: 'INR',
      customer_id: customerId,
      customer_email: profile.email || caller.email || 'student@noc.in',
      customer_phone: '9999999999', // placeholder — profile doesn't have phone
      payment_page_client_id: hdfcClientId,
      action: 'paymentPage',
      return_url: returnUrl,
    }

    log({
      level: 'INFO', fn: 'create-hdfc-session', action: 'calling_hdfc',
      userId: caller.id,
      meta: { order_id: orderId, amount, due_type, return_url: returnUrl }
    })

    const hdfcResponse = await fetch(`${hdfcBaseUrl}/session`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${hdfcApiKey}`,
        'Content-Type': 'application/json',
        'x-merchantid': hdfcMerchantId,
        'x-customerid': customerId,
      },
      body: JSON.stringify(sessionPayload),
    })

    const hdfcData = await hdfcResponse.json()

    if (!hdfcResponse.ok || hdfcData.status === 'FAILURE' || hdfcData.status === 'ERROR') {
      log({
        level: 'ERROR', fn: 'create-hdfc-session', action: 'hdfc_error',
        userId: caller.id,
        error: JSON.stringify(hdfcData),
      })
      return jsonResponse({
        error: 'Payment gateway error: ' + (hdfcData.error_message || hdfcData.status || 'Unknown error'),
      }, 502, undefined, req.headers.get('Origin') || '')
    }

    // Extract payment link from response
    const paymentLink = hdfcData.payment_links?.web || hdfcData.payment_links?.iframe || ''

    if (!paymentLink) {
      log({
        level: 'ERROR', fn: 'create-hdfc-session', action: 'no_payment_link',
        userId: caller.id,
        meta: { hdfc_response: hdfcData },
      })
      return jsonResponse({ error: 'No payment link received from gateway' }, 502, undefined, req.headers.get('Origin') || '')
    }

    // ── Insert payment_orders row ──
    const { error: insertError } = await adminClient
      .from('payment_orders')
      .insert({
        order_id: orderId,
        student_id: caller.id,
        amount: Number(amount),
        due_type,
        enrollment_ids: enrollmentIdList,
        status: 'CREATED',
        hdfc_status: hdfcData.status || 'CREATED',
      })

    if (insertError) {
      log({
        level: 'ERROR', fn: 'create-hdfc-session', action: 'db_insert_error',
        userId: caller.id,
        error: insertError.message,
      })
      // Don't fail the payment — the order was created in HDFC already
    }

    log({
      level: 'INFO', fn: 'create-hdfc-session', action: 'session_created',
      userId: caller.id, duration: elapsed(),
      meta: { order_id: orderId, amount, due_type, hdfc_status: hdfcData.status }
    })

    return jsonResponse({
      payment_link: paymentLink,
      order_id: orderId,
      order_token: hdfcData.id || null,
      amount: Number(amount),
    }, 200, undefined, req.headers.get('Origin') || '')

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'create-hdfc-session', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500, undefined, req.headers.get('Origin') || '')
  }
})
