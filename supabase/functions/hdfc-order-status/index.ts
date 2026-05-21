// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, getCorsHeaders, jsonResponse } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Order Status API (Step 4 in flow diagram)
 * Called after student returns from HDFC payment page.
 */

const HDFC_API_KEY = Deno.env.get('HDFC_API_KEY') || ''
const HDFC_MERCHANT_ID = Deno.env.get('HDFC_MERCHANT_ID') || ''
const HDFC_BASE_URL = Deno.env.get('HDFC_BASE_URL') || 'https://smartgateway.hdfcuat.bank.in'

const corsHeaders = getCorsHeaders()

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return jsonResponse({ error: 'Invalid or expired token' }, 401)

    const { order_id } = await req.json()
    if (!order_id) return jsonResponse({ error: 'order_id is required' }, 400)

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Verify order belongs to student
    const { data: orderRecord } = await adminClient
      .from('payment_orders')
      .select('*')
      .eq('gateway_order_id', order_id)
      .eq('student_id', user.id)
      .single()

    if (!orderRecord) return jsonResponse({ error: 'Order not found' }, 404)

    // Already processed
    if (orderRecord.status === 'paid') {
      return jsonResponse({ status: 'CHARGED', order_id, amount: orderRecord.amount, payment_id: orderRecord.gateway_payment_id, already_processed: true })
    }

    // Call HDFC Order Status API
    const hdfcAuth = `Basic ${btoa(`${HDFC_API_KEY}:`)}`
    const statusRes = await fetch(`${HDFC_BASE_URL}/orders/${order_id}`, {
      method: 'GET',
      headers: { 'Authorization': hdfcAuth, 'x-merchantid': HDFC_MERCHANT_ID, 'Content-Type': 'application/json', 'version': '2024-06-01' },
    })
    const statusData = await statusRes.json()

    if (!statusRes.ok) {
      return jsonResponse({ status: 'UNKNOWN', order_id, error: statusData?.error_message || 'Failed to fetch status' }, 502)
    }

    const txnStatus = statusData.status || 'UNKNOWN'
    const paymentId = statusData.txn_id || statusData.payment_id || null
    const amountPaid = statusData.amount ? parseFloat(statusData.amount) : orderRecord.amount

    // If CHARGED, process atomically
    if (txnStatus === 'CHARGED' && orderRecord.status !== 'paid') {
      await adminClient.rpc('process_payment_webhook', {
        p_razorpay_order_id: order_id,
        p_razorpay_payment_id: paymentId || `HDFC_${order_id}`,
        p_amount_paid: amountPaid,
      })
    }

    // If failed, mark as failed
    if (['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED'].includes(txnStatus)) {
      await adminClient.from('payment_orders').update({ status: 'failed' }).eq('id', orderRecord.id)
    }

    return jsonResponse({ status: txnStatus, order_id, amount: amountPaid, payment_id: paymentId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'hdfc-order-status', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
