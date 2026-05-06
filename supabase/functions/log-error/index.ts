// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

/**
 * log-error Edge Function
 *
 * Accepts a POST request with an error payload and writes it to
 * platform_error_logs using the service_role key (bypasses RLS).
 *
 * This is the ONLY secure path for frontend-originated error writes.
 * The anon/authenticated Supabase client on the frontend cannot write
 * to platform_error_logs directly because there is no permissive RLS policy.
 *
 * Expected request body:
 * {
 *   tenant_id?:          string (UUID)
 *   tenant_name?:        string
 *   dashboard_name:      string   (required)
 *   nav_path?:           string
 *   error_code:          string   (required)
 *   severity?:           'CRITICAL' | 'WARNING' | 'INFO'  (default: CRITICAL)
 *   error_detail:        string   (required)
 *   triggered_by_role?:  string
 *   triggered_by_email?: string
 * }
 *
 * Authentication: caller must include a valid Supabase JWT (anon or service).
 * The Edge Function itself uses the service key to INSERT — the caller
 * does NOT need the service key.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_SEVERITIES = ['CRITICAL', 'WARNING', 'INFO'] as const
type Severity = typeof VALID_SEVERITIES[number]

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Validate caller has a valid JWT (prevents anonymous log flooding)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Admin client — used for the INSERT (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Parse and validate the body
    const body = await req.json().catch(() => null)

    if (!body) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const {
      tenant_id,
      tenant_name,
      dashboard_name,
      nav_path,
      error_code,
      severity = 'CRITICAL',
      error_detail,
      triggered_by_role,
      triggered_by_email,
    } = body

    // Required field validation
    const missing: string[] = []
    if (!dashboard_name) missing.push('dashboard_name')
    if (!error_code)     missing.push('error_code')
    if (!error_detail)   missing.push('error_detail')

    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate severity
    const normalizedSeverity: Severity = VALID_SEVERITIES.includes(severity as Severity)
      ? (severity as Severity)
      : 'CRITICAL'

    // If tenant_id is provided but no tenant_name, try to resolve it
    let resolvedTenantName = tenant_name || null
    if (tenant_id && !resolvedTenantName) {
      const { data: t } = await adminClient
        .from('tenants')
        .select('name')
        .eq('id', tenant_id)
        .maybeSingle()
      resolvedTenantName = t?.name || null
    }

    // Insert into platform_error_logs
    const { error: insertError } = await adminClient
      .from('platform_error_logs')
      .insert({
        tenant_id:          tenant_id          || null,
        tenant_name:        resolvedTenantName || null,
        dashboard_name:     dashboard_name.trim(),
        nav_path:           nav_path           || null,
        error_code:         error_code.trim().toUpperCase(),
        severity:           normalizedSeverity,
        error_detail:       error_detail.trim(),
        triggered_by_role:  triggered_by_role  || null,
        triggered_by_email: triggered_by_email || null,
      })

    if (insertError) {
      console.error('[log-error] insert failed:', insertError)
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[log-error] unexpected error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
