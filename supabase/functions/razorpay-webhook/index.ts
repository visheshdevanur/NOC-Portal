// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { encode as hexEncode } from 'https://deno.land/std@0.177.0/encoding/hex.ts'

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || ''

// FIX #27: Constant-time comparison to prevent timing attacks on HMAC
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Verify Razorpay webhook signature using HMAC-SHA256.
 * Uses constant-time comparison to prevent timing attacks.
 */
async function verifyWebhookSignature(body: string, signature: string): Promise<boolean> {
  if (!RAZORPAY_WEBHOOK_SECRET || !signature) return false

  const encoder = new TextEncoder()
  const keyData = encoder.encode(RAZORPAY_WEBHOOK_SECRET)
  const messageData = encoder.encode(body)

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  const expectedSignature = new TextDecoder().decode(hexEncode(new Uint8Array(signatureBuffer)))

  return timingSafeCompare(expectedSignature, signature)
}

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature') || ''

    // 1. Verify webhook authenticity
    const isValid = await verifyWebhookSignature(body, signature)
    if (!isValid) {
      console.error('Invalid webhook signature')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse event
    const event = JSON.parse(body)
    if (event.event !== 'payment.captured') {
      return new Response(JSON.stringify({ received: true, event: event.event }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payment = event.payload?.payment?.entity
    if (!payment) {
      return new Response(JSON.stringify({ error: 'No payment entity in event' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const orderId = payment.order_id
    const paymentId = payment.id
    const amountPaid = payment.amount / 100 // paise to rupees

    console.log(`Processing payment: Order=${orderId}, Payment=${paymentId}, Amount=₹${amountPaid}`)

    // 3. Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey)

    // FIX #11: Process atomically via single RPC instead of 4 separate DB calls
    // This ensures all-or-nothing: payment_orders + enrollment + dues + activity log
    const { data, error } = await adminClient.rpc('process_payment_webhook', {
      p_razorpay_order_id: orderId,
      p_razorpay_payment_id: paymentId,
      p_amount_paid: amountPaid,
    })

    if (error) {
      console.error('Atomic payment RPC failed:', error.message)
      // Return 200 to prevent Razorpay infinite retries — log for manual reconciliation
      return new Response(JSON.stringify({ error: 'Processing failed', received: true, details: error.message }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Payment processed successfully: ${paymentId}`, data)
    return new Response(JSON.stringify({ success: true, ...(data || {}) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook processing error:', err)
    // Return 200 to prevent Razorpay infinite retries
    return new Response(JSON.stringify({ error: 'Processing failed', received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
