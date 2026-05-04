import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { name, slug, adminEmail, adminPassword, plan, maxUsers } = await req.json()

    if (!name || !slug || !adminEmail || !adminPassword) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Create tenant row
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({
        name,
        slug,
        plan: plan || 'free',
        status: 'active',
        admin_email: adminEmail,
        max_users: maxUsers || 500,
      })
      .select()
      .single()

    if (tenantErr) {
      return new Response(JSON.stringify({ error: tenantErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Create admin auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'admin', tenant_id: tenant.id },
    })

    if (authErr) {
      // Rollback tenant
      await supabase.from('tenants').delete().eq('id', tenant.id)
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Create admin profile
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: authData.user.id,
      full_name: `Admin - ${name}`,
      role: 'admin',
      tenant_id: tenant.id,
    })

    if (profileErr) {
      console.error('Profile creation error:', profileErr)
    }

    // 4. Seed default department
    await supabase.from('departments').insert({
      name: 'General',
      tenant_id: tenant.id,
    })

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenant.id,
        user_id: authData.user.id,
        login_url: `${supabaseUrl.replace('.supabase.co', '')}/login`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
