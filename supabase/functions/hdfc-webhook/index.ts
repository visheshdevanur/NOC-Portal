// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, jsonResponse, log } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Webhook Handler
 * Receives ORDER_SUCCEEDED / ORDER_FAILED events from HDFC.
 * Authentication: Basic Auth with credentials configured in HDFC Dashboard.
 */

const HDFC_WEBHOOK_USERNAME = Deno.env.get('HDFC_WEBHOOK_USERNAME') || ''
const HDFC_WEBHOOK_PASSWORD = Deno.env.get('HDFC_WEBHOOK_PASSWORD') || ''

// Create Supabase admin client ONCE outside the handler (not per-request)
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const corsHeaders = {
  ...getCorsHeaders(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Timing-safe string comparison to prevent timing attacks on webhook auth.
 * Uses constant-time comparison so the response time doesn't leak password info.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a)
  const bBuf = encoder.encode(b)

  // If lengths differ, compare b against itself to maintain constant time
  if (aBuf.byteLength !== bBuf.byteLength) {
    await crypto.subtle.timingSafeEqual(bBuf, bBuf)
    return false
  }

  return crypto.subtle.timingSafeEqual(aBuf, bBuf)
}

async function verifyBasicAuth(req: Request): Promise<boolean> {
  if (!HDFC_WEBHOOK_USERNAME) return false
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Basic ')) return false
  try {
    const decoded = atob(authHeader.substring(6))
    const colonIdx = decoded.indexOf(':')
    if (colonIdx === -1) return false
    const username = decoded.substring(0, colonIdx)
    const password = decoded.substring(colonIdx + 1)
    const userMatch = await timingSafeEqual(username, HDFC_WEBHOOK_USERNAME)
    const passMatch = await timingSafeEqual(password, HDFC_WEBHOOK_PASSWORD)
    return userMatch && passMatch
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify webhook authenticity via Basic Auth (timing-safe)
    const isValid = await verifyBasicAuth(req)
    if (!isValid) {
      log({ level: 'ERROR', fn: 'hdfc-webhook', action: 'auth_failed' })
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse event
    const body = await req.text()
    const event = JSON.parse(body)
    const eventName = event.event_name || event.event || ''

    log({ level: 'INFO', fn: 'hdfc-webhook', action: 'received', meta: { event: eventName } })

    // Only process successful payments
    if (eventName !== 'ORDER_SUCCEEDED' && eventName !== 'TXN_CHARGED') {
      // For failed/other events, just acknowledge
      if (eventName === 'ORDER_FAILED' || eventName === 'TXN_FAILED') {
        const orderId = event.content?.order?.order_id || event.order_id
        if (orderId) {
          await adminClient.from('payment_orders').update({ status: 'failed' }).eq('gateway_order_id', orderId)
          // S-13: Audit log for payment failure
          await adminClient.from('activity_logs').insert([{
            action: 'Payment Failed (Webhook)',
            details: `Order ${orderId} — Event: ${eventName}`,
            user_role: 'system',
          }]).catch(() => {}) // Don't fail webhook on audit log error
        }
      }
      return new Response(JSON.stringify({ received: true, event: eventName }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Extract payment details
    const orderContent = event.content?.order || event
    const orderId = orderContent.order_id
    const txnId = orderContent.txn_id || orderContent.payment_id || ''
    const amountPaid = orderContent.amount ? parseFloat(orderContent.amount) : 0

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'No order_id in event' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Replay protection: check if order is already paid before processing
    const { data: existingOrder } = await adminClient
      .from('payment_orders')
      .select('status')
      .eq('gateway_order_id', orderId)
      .single()

    if (existingOrder?.status === 'paid') {
      log({ level: 'INFO', fn: 'hdfc-webhook', action: 'duplicate_skipped', meta: { orderId } })
      return new Response(JSON.stringify({ success: true, already_processed: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    log({ level: 'INFO', fn: 'hdfc-webhook', action: 'processing', meta: { orderId, amount: amountPaid } })

    // 5. Process atomically via RPC
    // Note: RPC params retain legacy "razorpay" naming for backward compatibility with existing DB function
    const { data, error } = await adminClient.rpc('process_payment_webhook', {
      p_razorpay_order_id: orderId,
      p_razorpay_payment_id: txnId || `HDFC_WH_${orderId}`,
      p_amount_paid: amountPaid,
    })

    if (error) {
      log({ level: 'ERROR', fn: 'hdfc-webhook', action: 'rpc_failed', error: error.message, meta: { orderId } })
      // Return 200 to prevent HDFC infinite retries
      return new Response(JSON.stringify({ error: 'Processing failed', received: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // S-13: Audit log for successful payment
    await adminClient.from('activity_logs').insert([{
      action: 'Payment Verified (Webhook)',
      details: `Order ${orderId} — ₹${amountPaid} — Txn: ${txnId}`,
      user_role: 'system',
    }]).catch(() => {}) // Don't fail webhook on audit log error

    log({ level: 'INFO', fn: 'hdfc-webhook', action: 'processed', meta: { orderId, txnId } })
    return new Response(JSON.stringify({ success: true, ...(data || {}) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing error'
    log({ level: 'ERROR', fn: 'hdfc-webhook', action: 'unhandled_error', error: message })
    return new Response(JSON.stringify({ error: 'Processing failed', received: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
