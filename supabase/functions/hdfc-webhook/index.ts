// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, getCorsHeaders, jsonResponse } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Webhook Handler
 *
 * Receives async payment status updates from HDFC.
 * Backup mechanism — ensures payment is recorded even if student
 * closes browser before the callback page loads.
 *
 * No JWT auth — this is a server-to-server call from HDFC.
 * Validates by checking order_id exists in our payment_orders table.
 */

serve(async (req) => {
  // CORS preflight — webhooks shouldn't need this but just in case
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin') || '') })
  }

  try {
    const elapsed = startTimer()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ── Parse webhook payload ──
    // HDFC sends form-urlencoded or JSON depending on config
    let webhookData: Record<string, any> = {}
    
    const contentType = req.headers.get('Content-Type') || ''
    if (contentType.includes('application/json')) {
      webhookData = await req.json()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData()
      for (const [key, value] of formData.entries()) {
        webhookData[key] = value
      }
    } else {
      // Try JSON first, fall back to text
      try {
        webhookData = await req.json()
      } catch {
        const text = await req.text()
        log({ level: 'WARN', fn: 'hdfc-webhook', action: 'unknown_content_type', meta: { body: text.substring(0, 500) } })
        return jsonResponse({ status: 'ok' }, 200)
      }
    }

    const orderId = webhookData.order_id || webhookData.orderId
    const status = webhookData.status
    const txnId = webhookData.txn_id || webhookData.txnId

    log({
      level: 'INFO', fn: 'hdfc-webhook', action: 'received',
      meta: {
        order_id: orderId,
        status,
        txn_id: txnId,
        payload_keys: Object.keys(webhookData),
      }
    })

    if (!orderId) {
      log({ level: 'WARN', fn: 'hdfc-webhook', action: 'missing_order_id' })
      return jsonResponse({ status: 'ok', message: 'No order_id' }, 200)
    }

    // ── Look up payment_orders ──
    const { data: paymentOrder, error: orderError } = await adminClient
      .from('payment_orders')
      .select('*')
      .eq('order_id', orderId)
      .single()

    if (orderError || !paymentOrder) {
      log({
        level: 'WARN', fn: 'hdfc-webhook', action: 'order_not_found',
        meta: { order_id: orderId }
      })
      return jsonResponse({ status: 'ok', message: 'Order not found' }, 200)
    }

    // ── Skip if already CHARGED ──
    if (paymentOrder.status === 'CHARGED') {
      log({
        level: 'INFO', fn: 'hdfc-webhook', action: 'already_charged',
        meta: { order_id: orderId }
      })
      return jsonResponse({ status: 'ok', message: 'Already processed' }, 200)
    }

    // ── Update order status ──
    const updateData: Record<string, any> = {
      hdfc_status: status,
      hdfc_response: webhookData,
      txn_id: txnId || paymentOrder.txn_id,
      payment_method: webhookData.payment_method_type || webhookData.payment_method || paymentOrder.payment_method,
      updated_at: new Date().toISOString(),
    }

    if (status === 'CHARGED') {
      updateData.status = 'CHARGED'

      const { due_type, enrollment_ids } = paymentOrder

      // Mark enrollments as paid
      if (due_type === 'attendance_fine' || due_type === 'attendance_fine_bulk') {
        for (const eid of enrollment_ids) {
          await adminClient
            .from('subject_enrollment')
            .update({ attendance_fee_verified: true })
            .eq('id', eid)
        }
      } else if (due_type === 'other_dues') {
        for (const dueId of enrollment_ids) {
          await adminClient
            .from('other_dues')
            .update({ status: 'paid' })
            .eq('id', dueId)
        }
      }

      // Log activity
      const { data: studentProfile } = await adminClient
        .from('profiles')
        .select('email, full_name, tenant_id')
        .eq('id', paymentOrder.student_id)
        .single()

      await adminClient.from('activity_logs').insert({
        user_id: paymentOrder.student_id,
        user_role: 'student',
        user_name: studentProfile?.email || 'unknown',
        action: 'Payment Completed (Webhook)',
        details: `₹${paymentOrder.amount} paid via HDFC SmartGateway (${due_type}). Order: ${orderId}, Txn: ${txnId}`,
        tenant_id: studentProfile?.tenant_id,
      })

      log({
        level: 'INFO', fn: 'hdfc-webhook', action: 'payment_verified',
        meta: { order_id: orderId, amount: paymentOrder.amount, enrollment_count: enrollment_ids.length }
      })

    } else if (['AUTHENTICATION_FAILED', 'AUTHORIZATION_FAILED', 'JUSPAY_DECLINED'].includes(status)) {
      updateData.status = 'FAILED'
    }

    // Update DB
    await adminClient
      .from('payment_orders')
      .update(updateData)
      .eq('order_id', orderId)

    log({
      level: 'INFO', fn: 'hdfc-webhook', action: 'processed',
      duration: elapsed(),
      meta: { order_id: orderId, status }
    })

    // Always return 200 to HDFC
    return jsonResponse({ status: 'ok' }, 200)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error'
    log({ level: 'ERROR', fn: 'hdfc-webhook', action: 'failed', error: message })
    // Always return 200 to HDFC — retries would be noise
    return jsonResponse({ status: 'ok' }, 200)
  }
})
