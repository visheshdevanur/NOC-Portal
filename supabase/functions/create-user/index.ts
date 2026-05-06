// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, checkRateLimit, getCorsHeaders, jsonResponse } from '../_shared/utils.ts'

const corsHeaders = getCorsHeaders()

/**
 * Role hierarchy: who can create whom.
 * A role can only create roles that are below it in the hierarchy.
 */
const ROLE_HIERARCHY: Record<string, string[]> = {
  admin: ['hod', 'staff', 'faculty', 'teacher', 'coe', 'accounts', 'librarian', 'principal', 'fyc', 'clerk', 'student'],
  hod: ['staff', 'faculty', 'teacher', 'student'],
  fyc: ['clerk', 'teacher'],
  staff: ['teacher', 'student'],
  clerk: ['teacher', 'student'],
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const elapsed = startTimer()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // 1. Validate the caller's JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: caller }, error: authError } = await userClient.auth.getUser()
    if (authError || !caller) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    // Rate limit: 10 user creations per minute per caller
    const rl = checkRateLimit(`create-user:${caller.id}`, 10, 60_000)
    if (!rl.allowed) {
      log({ level: 'WARN', fn: 'create-user', action: 'rate_limited', userId: caller.id })
      return jsonResponse({ error: 'Too many requests. Please wait a moment.' }, 429, {
        'Retry-After': String(Math.ceil(rl.resetMs / 1000)),
      })
    }

    // 2. Get caller's profile to check permissions
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, department_id, tenant_id')
      .eq('id', caller.id)
      .single()

    if (profileError || !callerProfile) {
      return jsonResponse({ error: 'Caller profile not found' }, 403)
    }

    // 3. Parse and validate the request
    const { email, password, full_name, role, department_id, roll_number, teacher_id, section, semester_id } = await req.json()

    if (!email || !password || !full_name || !role) {
      return jsonResponse({ error: 'email, password, full_name, and role are required' }, 400)
    }

    // Basic validation
    if (password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters' }, 400)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return jsonResponse({ error: 'Invalid email format' }, 400)
    }

    // 4. Authorization: check if caller's role can create the requested role
    const allowedRoles = ROLE_HIERARCHY[callerProfile.role]
    if (!allowedRoles) {
      return jsonResponse({ error: `Your role (${callerProfile.role}) cannot create users` }, 403)
    }

    if (!allowedRoles.includes(role)) {
      return jsonResponse({
        error: `Your role (${callerProfile.role}) cannot create users with role "${role}"`
      }, 403)
    }

    // 5. Create the auth user (using service_role — server-side only)
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, tenant_id: callerProfile.tenant_id },
      app_metadata: { tenant_id: callerProfile.tenant_id },
    })

    if (createError) {
      return jsonResponse({ error: createError.message }, 400)
    }

    if (!authData.user) {
      return jsonResponse({ error: 'User creation failed' }, 500)
    }

    // 6. Create the profile
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      full_name,
      role,
      tenant_id: callerProfile.tenant_id,
      created_by: caller.id,
    }

    if (department_id) profileData.department_id = department_id
    if (roll_number) profileData.roll_number = roll_number
    if (teacher_id) profileData.roll_number = teacher_id // teacher_id is stored in roll_number
    if (section) profileData.section = section
    if (semester_id) profileData.semester_id = semester_id

    const { error: insertError } = await adminClient.from('profiles').insert(profileData)

    if (insertError) {
      // Rollback: delete the auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return jsonResponse({ error: `Profile creation failed: ${insertError.message}` }, 500)
    }

    // 7. Log the action
    await adminClient.from('activity_logs').insert({
      user_id: caller.id,
      user_role: callerProfile.role,
      user_name: caller.email,
      action: 'User Created',
      details: `Created ${role} profile for ${full_name}`,
      tenant_id: callerProfile.tenant_id,
    })

    log({ level: 'INFO', fn: 'create-user', action: 'created', userId: caller.id, duration: elapsed(), meta: { role, email } })

    return jsonResponse({
      success: true,
      user_id: authData.user.id,
      message: `${role} "${full_name}" created successfully`,
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'create-user', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
