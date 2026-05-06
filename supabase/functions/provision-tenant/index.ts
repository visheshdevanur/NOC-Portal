import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // 1. Validate caller JWT — must be a platform admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    // Verify caller is a platform admin
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single()

    if (!callerProfile?.is_platform_admin) {
      return jsonResponse({ error: 'Forbidden — platform admin access required' }, 403)
    }

    // 2. Parse and validate input
    const { name, slug, adminEmail, adminPassword, plan, maxUsers } = await req.json()

    if (!name || !slug || !adminEmail || !adminPassword) {
      return jsonResponse({ error: 'Missing required fields: name, slug, adminEmail, adminPassword' }, 400)
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return jsonResponse({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, 400)
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return jsonResponse({ error: 'Invalid admin email format' }, 400)
    }

    // Validate password strength
    if (adminPassword.length < 8) {
      return jsonResponse({ error: 'Admin password must be at least 8 characters' }, 400)
    }

    // 3. Create tenant row
    const { data: tenant, error: tenantErr } = await adminClient
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
      return jsonResponse({ error: tenantErr.message }, 400)
    }

    // 4. Create admin auth user with tenant_id in app_metadata (for optimized RLS)
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { tenant_id: tenant.id },
      user_metadata: { role: 'admin', tenant_id: tenant.id },
    })

    if (authErr) {
      // Rollback tenant on auth failure
      await adminClient.from('tenants').delete().eq('id', tenant.id)
      return jsonResponse({ error: authErr.message }, 400)
    }

    // 5. Create admin profile
    const { error: profileErr } = await adminClient.from('profiles').insert({
      id: authData.user.id,
      full_name: `Admin - ${name}`,
      role: 'admin',
      tenant_id: tenant.id,
    })

    if (profileErr) {
      console.error('Profile creation error:', profileErr)
    }

    // 6. Seed default department
    await adminClient.from('departments').insert({
      name: 'General',
      tenant_id: tenant.id,
    })

    return jsonResponse({
      success: true,
      tenant_id: tenant.id,
      user_id: authData.user.id,
    })
  } catch (err) {
    console.error('Provision tenant error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
