import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Get all recent payment orders to find customer IDs
    const { data: orders } = await adminClient
      .from('payment_orders')
      .select('id, student_id, gateway_order_id, status, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    // For each order, get the student's auth email AND profile email
    const results = []
    if (orders) {
      for (const order of orders) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('id, email, full_name, role, roll_number')
          .eq('id', order.student_id)
          .single()

        const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(order.student_id)

        results.push({
          order_id: order.gateway_order_id,
          order_status: order.status,
          amount: order.amount,
          created_at: order.created_at,
          student_id: order.student_id,
          customer_id_hdfc: order.student_id.replace(/-/g, '').substring(0, 18) + 'v2',
          auth_email: authUser?.email || '(null)',
          profile_email: profile?.email || '(null)',
          full_name: profile?.full_name || '(null)',
          roll_number: profile?.roll_number || '(null)',
          role: profile?.role || '(null)',
        })
      }
    }

    return new Response(JSON.stringify({ results }, null, 2), { headers: corsHeaders })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
  }
})
