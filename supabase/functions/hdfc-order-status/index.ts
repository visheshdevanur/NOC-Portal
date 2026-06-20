// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, checkRateLimit, getCorsHeaders, jsonResponse, validateOrigin } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Order Status API
 *
 * Called from the PaymentCallback page after HDFC redirects back.
 * 
 * Flow:
 *   1. Validate caller JWT
 *   2. Look up payment_orders row
 *   3. Call HDFC Order Status API: GET /orders/{order_id}
 *   4. Log FULL HDFC response to payment_orders.hdfc_response
 *   5. If CHARGED → mark enrollment(s) as paid
 *   6. Return full order status to frontend
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

    // Rate limit: 30 status checks per minute
    const rl = checkRateLimit(`hdfc-status:${caller.id}`, 30, 60_000)
    if (!rl.allowed) {
      return jsonResponse({ error: 'Too many requests' }, 429, undefined, req.headers.get('Origin') || '')
    }

    // ── Parse request ──
    const body = await req.json()
    const { order_id } = body

    if (!order_id) {
      return jsonResponse({ error: 'order_id is required' }, 400, undefined, req.headers.get('Origin') || '')
    }

    // ── Look up payment_orders ──
    const { data: paymentOrder, error: orderError } = await adminClient
      .from('payment_orders')
      .select('*')
      .eq('order_id', order_id)
      .single()

    if (orderError || !paymentOrder) {
      return jsonResponse({ error: 'Order not found' }, 404, undefined, req.headers.get('Origin') || '')
    }

    // Verify caller owns this order
    if (paymentOrder.student_id !== caller.id) {
      return jsonResponse({ error: 'Unauthorized' }, 403, undefined, req.headers.get('Origin') || '')
    }

    // If already CHARGED, return cached response without hitting HDFC again
    if (paymentOrder.status === 'CHARGED' && paymentOrder.hdfc_response) {
      log({
        level: 'INFO', fn: 'hdfc-order-status', action: 'cached_response',
        userId: caller.id, duration: elapsed(),
        meta: { order_id, status: 'CHARGED' }
      })
      return jsonResponse({
        status: 'CHARGED',
        order_id: paymentOrder.order_id,
        amount: paymentOrder.amount,
        txn_id: paymentOrder.txn_id,
        payment_method: paymentOrder.payment_method,
        hdfc_response: paymentOrder.hdfc_response,
      }, 200, undefined, req.headers.get('Origin') || '')
    }

    // ── HDFC credentials ──
    const hdfcApiKey = Deno.env.get('HDFC_API_KEY')
    const hdfcMerchantId = Deno.env.get('HDFC_MERCHANT_ID')
    const hdfcBaseUrl = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'

    if (!hdfcApiKey || !hdfcMerchantId) {
      return jsonResponse({ error: 'Payment service not configured' }, 500, undefined, req.headers.get('Origin') || '')
    }

    // ── Customer ID: same derivation as session creation ──
    const customerId = caller.id.replace(/-/g, '').substring(0, 20)

    // ── Call HDFC Order Status API ──
    // GET /orders/{order_id} with Basic Auth
    log({
      level: 'INFO', fn: 'hdfc-order-status', action: 'calling_hdfc',
      userId: caller.id, meta: { order_id }
    })

    const hdfcResponse = await fetch(`${hdfcBaseUrl}/orders/${order_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${hdfcApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'version': '2023-06-30',
        'x-merchantid': hdfcMerchantId,
        'x-customerid': customerId,
      },
    })

    const hdfcData = await hdfcResponse.json()

    // ── Log the FULL HDFC response to DB ──
    // This is the detailed order status log the user requested
    const hdfcStatus = hdfcData.status || 'UNKNOWN'
    const txnId = hdfcData.txn_id || hdfcData.txn_detail?.txn_id || null
    const paymentMethod = hdfcData.payment_method_type || hdfcData.payment_method || null

    log({
      level: 'INFO', fn: 'hdfc-order-status', action: 'hdfc_response',
      userId: caller.id,
      meta: {
        order_id,
        status: hdfcStatus,
        txn_id: txnId,
        payment_method: paymentMethod,
        amount: hdfcData.amount,
        customer_email: hdfcData.customer_email,
        customer_id: hdfcData.customer_id,
      }
    })

    // ── Update payment_orders with full response ──
    const updateData: Record<string, any> = {
      hdfc_status: hdfcStatus,
      hdfc_response: hdfcData,   // Store the FULL response JSON
      txn_id: txnId,
      payment_method: paymentMethod,
      updated_at: new Date().toISOString(),
    }

    // ── If CHARGED → mark enrollments as paid ──
    if (hdfcStatus === 'CHARGED' && paymentOrder.status !== 'CHARGED') {
      updateData.status = 'CHARGED'

      const { due_type, enrollment_ids } = paymentOrder

      if (due_type === 'attendance_fine' || due_type === 'attendance_fine_bulk') {
        // Mark all enrollment attendance_fee_verified = true
        for (const eid of enrollment_ids) {
          const { error: updateErr } = await adminClient
            .from('subject_enrollment')
            .update({ attendance_fee_verified: true })
            .eq('id', eid)

          if (updateErr) {
            log({
              level: 'ERROR', fn: 'hdfc-order-status', action: 'enrollment_update_failed',
              userId: caller.id, error: updateErr.message,
              meta: { enrollment_id: eid }
            })
          }
        }

        log({
          level: 'INFO', fn: 'hdfc-order-status', action: 'enrollments_verified',
          userId: caller.id,
          meta: { count: enrollment_ids.length, enrollment_ids }
        })

      } else if (due_type === 'other_dues') {
        // Mark the other_due as paid
        for (const dueId of enrollment_ids) {
          const { error: updateErr } = await adminClient
            .from('other_dues')
            .update({ status: 'paid' })
            .eq('id', dueId)

          if (updateErr) {
            log({
              level: 'ERROR', fn: 'hdfc-order-status', action: 'other_due_update_failed',
              userId: caller.id, error: updateErr.message,
              meta: { due_id: dueId }
            })
          }
        }
      }

      // Log activity
      const { data: studentProfile } = await adminClient
        .from('profiles')
        .select('full_name, tenant_id')
        .eq('id', caller.id)
        .single()

      await adminClient.from('activity_logs').insert({
        user_id: caller.id,
        user_role: 'student',
        user_name: caller.email,
        action: 'Payment Completed',
        details: `₹${paymentOrder.amount} paid via HDFC SmartGateway (${due_type}). Order: ${order_id}, Txn: ${txnId}`,
        tenant_id: studentProfile?.tenant_id,
      })

    } else if (['AUTHENTICATION_FAILED', 'AUTHORIZATION_FAILED', 'JUSPAY_DECLINED'].includes(hdfcStatus)) {
      updateData.status = 'FAILED'
    }

    // Update payment_orders row
    const { error: updateError } = await adminClient
      .from('payment_orders')
      .update(updateData)
      .eq('order_id', order_id)

    if (updateError) {
      log({
        level: 'ERROR', fn: 'hdfc-order-status', action: 'db_update_error',
        userId: caller.id, error: updateError.message,
      })
    }

    log({
      level: 'INFO', fn: 'hdfc-order-status', action: 'completed',
      userId: caller.id, duration: elapsed(),
      meta: { order_id, final_status: updateData.status || paymentOrder.status }
    })

    // ── Return full response to frontend ──
    return jsonResponse({
      status: updateData.status || paymentOrder.status,
      order_id: paymentOrder.order_id,
      amount: paymentOrder.amount,
      txn_id: txnId,
      payment_method: paymentMethod,
      due_type: paymentOrder.due_type,
      hdfc_response: hdfcData,  // Full HDFC response for detailed logging
    }, 200, undefined, req.headers.get('Origin') || '')

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'hdfc-order-status', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500, undefined, req.headers.get('Origin') || '')
  }
})
