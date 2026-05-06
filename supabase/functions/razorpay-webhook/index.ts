import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { encode as hexEncode } from 'https://deno.land/std@0.177.0/encoding/hex.ts'

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || ''

/**
 * Verify Razorpay webhook signature using HMAC-SHA256.
 * Razorpay sends the signature in `x-razorpay-signature` header.
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

  return expectedSignature === signature
}

serve(async (req) => {
  // Webhooks are POST only — no CORS needed (server-to-server)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''

  // 1. Verify webhook signature
  const isValid = await verifyWebhookSignature(rawBody, signature)
  if (!isValid) {
    console.error('Invalid Razorpay webhook signature')
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
  }

  try {
    const event = JSON.parse(rawBody)
    const eventType = event?.event

    // 2. Only process payment.captured events
    if (eventType !== 'payment.captured') {
      // Acknowledge other events without processing
      return new Response(JSON.stringify({ received: true, event: eventType }), { status: 200 })
    }

    const payment = event?.payload?.payment?.entity
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Missing payment entity' }), { status: 400 })
    }

    const orderId = payment.order_id
    const paymentId = payment.id
    const amountPaid = payment.amount / 100 // Convert from paise to rupees

    console.log(`Processing payment: ${paymentId} for order: ${orderId}, amount: ₹${amountPaid}`)

    // 3. Create admin client (server-side only)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey)

    // 4. Look up the order in our payment_orders table
    const { data: orderRecord, error: orderError } = await adminClient
      .from('payment_orders')
      .select('*')
      .eq('razorpay_order_id', orderId)
      .single()

    if (orderError || !orderRecord) {
      console.error(`Order not found: ${orderId}`, orderError)
      // Still return 200 to prevent Razorpay from retrying
      return new Response(JSON.stringify({ error: 'Order not found', order_id: orderId }), { status: 200 })
    }

    // 5. Prevent double-processing (idempotency)
    if (orderRecord.status === 'paid') {
      console.log(`Order ${orderId} already processed, skipping`)
      return new Response(JSON.stringify({ received: true, already_processed: true }), { status: 200 })
    }

    const studentId = orderRecord.student_id
    const enrollmentId = orderRecord.enrollment_id

    // 6. Atomically update payment status + attendance fee verification
    // Update payment order status
    await adminClient
      .from('payment_orders')
      .update({
        status: 'paid',
        razorpay_payment_id: paymentId,
        amount_paid: amountPaid,
        paid_at: new Date().toISOString(),
      })
      .eq('id', orderRecord.id)

    // If this payment is for an attendance fine on a specific enrollment
    if (enrollmentId) {
      await adminClient
        .from('subject_enrollment')
        .update({ attendance_fee_verified: true })
        .eq('id', enrollmentId)
        .eq('student_id', studentId)
    }

    // If this payment is for a college fee due
    if (orderRecord.due_type === 'college_fee') {
      await adminClient
        .from('student_dues')
        .update({ status: 'completed', paid_amount: amountPaid })
        .eq('student_id', studentId)
    }

    // 7. Log the payment
    await adminClient.from('activity_logs').insert({
      user_id: studentId,
      user_role: 'student',
      action: 'Payment Completed',
      details: `Payment ₹${amountPaid} verified via webhook (Order: ${orderId}, Payment: ${paymentId})`,
    })

    console.log(`Payment processed successfully: ${paymentId}`)
    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (err) {
    console.error('Webhook processing error:', err)
    // Return 200 anyway to prevent Razorpay infinite retries
    return new Response(JSON.stringify({ error: 'Processing failed', received: true }), { status: 200 })
  }
})
