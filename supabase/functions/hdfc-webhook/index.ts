// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, jsonResponse } from '../_shared/utils.ts'

/**
 * HDFC SmartGateway — Webhook Handler
 * Receives ORDER_SUCCEEDED / ORDER_FAILED events from HDFC.
 * Authentication: Basic Auth with credentials configured in HDFC Dashboard.
 */

const HDFC_WEBHOOK_USERNAME = Deno.env.get('HDFC_WEBHOOK_USERNAME') || ''
const HDFC_WEBHOOK_PASSWORD = Deno.env.get('HDFC_WEBHOOK_PASSWORD') || ''

const corsHeaders = {
  ...getCorsHeaders(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function verifyBasicAuth(req: Request): boolean {
  if (!HDFC_WEBHOOK_USERNAME) return false
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Basic ')) return false
  try {
    const decoded = atob(authHeader.substring(6))
    const [username, password] = decoded.split(':')
    return username === HDFC_WEBHOOK_USERNAME && password === HDFC_WEBHOOK_PASSWORD
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify webhook authenticity via Basic Auth
    const isValid = verifyBasicAuth(req)
    if (!isValid) {
      console.error('Invalid webhook authentication')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse event
    const body = await req.text()
    const event = JSON.parse(body)
    const eventName = event.event_name || event.event || ''

    console.log(`HDFC Webhook received: ${eventName}`)

    // Only process successful payments
    if (eventName !== 'ORDER_SUCCEEDED' && eventName !== 'TXN_CHARGED') {
      // For failed/other events, just acknowledge
      if (eventName === 'ORDER_FAILED' || eventName === 'TXN_FAILED') {
        const orderId = event.content?.order?.order_id || event.order_id
        if (orderId) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          const adminClient = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
          await adminClient.from('payment_orders').update({ status: 'failed' }).eq('gateway_order_id', orderId)
        }
      }
      return new Response(JSON.stringify({ received: true, event: eventName }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Extract payment details
    const orderContent = event.content?.order || event
    const orderId = orderContent.order_id
    const paymentId = orderContent.txn_id || orderContent.payment_id || ''
    const amountPaid = orderContent.amount ? parseFloat(orderContent.amount) : 0

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'No order_id in event' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Processing payment: Order=${orderId}, Payment=${paymentId}, Amount=₹${amountPaid}`)

    // 4. Process atomically via RPC
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await adminClient.rpc('process_payment_webhook', {
      p_razorpay_order_id: orderId,
      p_razorpay_payment_id: paymentId || `HDFC_WH_${orderId}`,
      p_amount_paid: amountPaid,
    })

    if (error) {
      console.error('Payment processing failed:', error.message)
      // Return 200 to prevent HDFC infinite retries
      return new Response(JSON.stringify({ error: 'Processing failed', received: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Payment processed: ${paymentId}`, data)
    return new Response(JSON.stringify({ success: true, ...(data || {}) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: 'Processing failed', received: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
