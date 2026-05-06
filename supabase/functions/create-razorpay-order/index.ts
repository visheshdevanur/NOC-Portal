import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    return jsonResponse(data)
  } catch (error) {
    console.error('Error processing order:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return jsonResponse({ error: message }, 500)
  }
})
