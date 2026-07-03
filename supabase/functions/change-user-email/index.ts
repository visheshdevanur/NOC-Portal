// @ts-nocheck — Deno runtime
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, log } from '../_shared/utils.ts'

serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || ''
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Authenticate caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token)
    if (authErr || !caller) throw new Error('Invalid token')

    // Verify caller is HOD or admin
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, department_id, tenant_id')
      .eq('id', caller.id)
      .single()
    if (!callerProfile || !['hod', 'admin', 'staff'].includes(callerProfile.role)) {
      throw new Error('Forbidden: only HOD/Admin/Staff can change login IDs')
    }

    const { userId, newEmail } = await req.json()
    if (!userId || !newEmail) throw new Error('userId and newEmail are required')

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) throw new Error('Invalid email format')

    // Update auth email using admin API
    const { data: updatedUser, error: updateErr } = await adminClient.auth.admin.updateUserById(
      userId,
      { email: newEmail, email_confirm: true }
    )
    if (updateErr) throw updateErr

    // Update profiles table
    await adminClient
      .from('profiles')
      .update({ email: newEmail })
      .eq('id', userId)

    log({
      level: 'INFO', fn: 'change-user-email', action: 'email_changed',
      userId: caller.id,
      meta: { target_user: userId, new_email: newEmail }
    })

    return new Response(JSON.stringify({ success: true, message: 'Login ID updated successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    log({ level: 'ERROR', fn: 'change-user-email', action: 'error', meta: { error: err.message } })
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
