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

/**
 * Validate that the caller is a platform super admin.
 * Uses the JWT from the Authorization header and checks the profile.
 */
async function validateSuperAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing Authorization header')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Create a client with the user's JWT to verify identity
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) throw new Error('Invalid or expired token')

  // Check if user is a platform admin via service_role (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceKey)
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, is_platform_admin')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) throw new Error('Profile not found')
  if (profile.role !== 'super_admin' && !profile.is_platform_admin) {
    throw new Error('Forbidden: not a platform administrator')
  }

  return { user, adminClient }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { adminClient } = await validateSuperAdmin(req)
    const { action, ...params } = await req.json()

    switch (action) {
      // ─── LIST TENANTS ───
      case 'list-tenants': {
        const { data, error } = await adminClient
          .from('tenants')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        return jsonResponse({ data })
      }

      // ─── GET TENANT USER COUNT ───
      case 'get-tenant-user-count': {
        const { tenant_id } = params
        const { count, error } = await adminClient
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant_id)
        if (error) throw error
        return jsonResponse({ count })
      }

      // ─── GET TENANT DETAILS ───
      case 'get-tenant-details': {
        const { tenant_id } = params
        const { data, error } = await adminClient
          .from('tenants')
          .select('*')
          .eq('id', tenant_id)
          .single()
        if (error) throw error

        // Get user counts by role
        const { data: users, error: usersErr } = await adminClient
          .from('profiles')
          .select('role')
          .eq('tenant_id', tenant_id)
        if (usersErr) throw usersErr

        const roleCounts: Record<string, number> = {}
        for (const u of users || []) {
          roleCounts[u.role] = (roleCounts[u.role] || 0) + 1
        }

        return jsonResponse({ data: { ...data, roleCounts, totalUsers: users?.length || 0 } })
      }

      // ─── CREATE TENANT ───
      case 'create-tenant': {
        const { name, slug, adminEmail, adminPassword, plan, maxUsers } = params
        if (!name || !slug || !adminEmail || !adminPassword) {
          return jsonResponse({ error: 'Missing required fields' }, 400)
        }

        // Check uniqueness
        const { data: existingSlug } = await adminClient
          .from('tenants')
          .select('id')
          .eq('slug', slug)
          .maybeSingle()
        if (existingSlug) return jsonResponse({ error: 'Slug already exists' }, 400)

        const { data: existingEmail } = await adminClient
          .from('tenants')
          .select('id')
          .eq('admin_email', adminEmail)
          .maybeSingle()
        if (existingEmail) return jsonResponse({ error: 'Admin email already in use' }, 400)

        // Create tenant
        const { data: tenant, error: tenantErr } = await adminClient
          .from('tenants')
          .insert({ name, slug, plan: plan || 'free', status: 'active', admin_email: adminEmail, max_users: maxUsers || 500 })
          .select()
          .single()
        if (tenantErr) throw tenantErr

        // Create auth user
        const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
          user_metadata: { role: 'admin', tenant_id: tenant.id },
          app_metadata: { tenant_id: tenant.id },
        })
        if (authErr) {
          await adminClient.from('tenants').delete().eq('id', tenant.id)
          throw authErr
        }

        // Create profile
        await adminClient.from('profiles').insert({
          id: authData.user.id,
          full_name: `Admin - ${name}`,
          role: 'admin',
          tenant_id: tenant.id,
        })

        // Seed default department
        await adminClient.from('departments').insert({ name: 'General', tenant_id: tenant.id })

        return jsonResponse({ success: true, tenant_id: tenant.id, user_id: authData.user.id })
      }

      // ─── EDIT TENANT ───
      case 'edit-tenant': {
        const { tenant_id, ...updates } = params
        if (!tenant_id) return jsonResponse({ error: 'tenant_id required' }, 400)

        const allowedFields = ['name', 'slug', 'plan', 'max_users', 'admin_email', 'status']
        const cleanUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        for (const key of allowedFields) {
          if (updates[key] !== undefined) cleanUpdates[key] = updates[key]
        }

        const { error } = await adminClient.from('tenants').update(cleanUpdates).eq('id', tenant_id)
        if (error) throw error
        return jsonResponse({ success: true })
      }

      // ─── TOGGLE TENANT STATUS ───
      case 'toggle-status': {
        const { tenant_id, status } = params
        if (!['active', 'suspended'].includes(status)) {
          return jsonResponse({ error: 'Status must be active or suspended' }, 400)
        }
        const { error } = await adminClient
          .from('tenants')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', tenant_id)
        if (error) throw error
        return jsonResponse({ success: true })
      }

      // ─── DELETE TENANT ───
      case 'delete-tenant': {
        const { tenant_id } = params
        if (!tenant_id) return jsonResponse({ error: 'tenant_id required' }, 400)

        // Delete all profiles (auth users) for this tenant
        const { data: profiles } = await adminClient
          .from('profiles')
          .select('id')
          .eq('tenant_id', tenant_id)

        if (profiles) {
          for (const p of profiles) {
            await adminClient.auth.admin.deleteUser(p.id)
          }
        }

        const { error } = await adminClient.from('tenants').delete().eq('id', tenant_id)
        if (error) throw error
        return jsonResponse({ success: true })
      }

      // ─── PLATFORM STATS ───
      case 'get-platform-stats': {
        const [tenantRes, userRes, clearanceRes, activeRes] = await Promise.all([
          adminClient.from('tenants').select('*', { count: 'exact', head: true }),
          adminClient.from('profiles').select('*', { count: 'exact', head: true }),
          adminClient.from('clearance_requests').select('*', { count: 'exact', head: true }),
          adminClient.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        ])
        return jsonResponse({
          totalTenants: tenantRes.count || 0,
          totalUsers: userRes.count || 0,
          totalClearances: clearanceRes.count || 0,
          activeTenants: activeRes.count || 0,
        })
      }

      // ─── ERROR LOGS ───
      case 'get-errors': {
        const { severity, dashboard, limit = 100 } = params
        let query = adminClient
          .from('platform_error_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit)
        if (severity) query = query.eq('severity', severity)
        if (dashboard) query = query.eq('dashboard_name', dashboard)
        const { data, error } = await query
        if (error) throw error
        return jsonResponse({ data })
      }

      // ─── ERROR STATS ───
      case 'get-error-stats': {
        const { data, error } = await adminClient
          .from('platform_error_logs')
          .select('severity')
        if (error) throw error
        const stats = { CRITICAL: 0, WARNING: 0, INFO: 0 }
        for (const row of data || []) {
          if (row.severity in stats) stats[row.severity as keyof typeof stats]++
        }
        return jsonResponse({ stats, total: data?.length || 0 })
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Forbidden') ? 403
      : message.includes('Invalid') || message.includes('Missing') ? 401
      : 500
    return jsonResponse({ error: message }, status)
  }
})
