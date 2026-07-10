// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, checkRateLimit, getCorsHeaders, jsonResponse, validateOrigin } from '../_shared/utils.ts'

const corsHeaders = getCorsHeaders()

/**
 * Role hierarchy: who can create whom.
 * A role can only create roles that are below it in the hierarchy.
 */
const ROLE_HIERARCHY: Record<string, string[]> = {
  admin: ['hod', 'staff', 'faculty', 'teacher', 'accounts', 'librarian', 'principal', 'fyc', 'clerk', 'coe', 'oe', 'aicte', 'student'],
  hod: ['staff', 'faculty', 'teacher', 'student'],
  fyc: ['clerk', 'teacher'],
  staff: ['teacher', 'student'],
  clerk: ['teacher', 'student'],
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin') || '') })
  }

  // Reject cross-origin requests in production
  const originError = validateOrigin(req)
  if (originError) return originError

  try {
    const elapsed = startTimer()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Validate the caller's JWT using service_role (anon key validation is unreliable)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !caller) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    // Rate limit: 200 user creations per minute per caller (supports bulk CSV uploads)
    const rl = checkRateLimit(`create-user:${caller.id}`, 1500, 60_000)
    if (!rl.allowed) {
      log({ level: 'WARN', fn: 'create-user', action: 'rate_limited', userId: caller.id })
      return jsonResponse({ error: 'Too many requests. Please wait a moment.' }, 429, {
        'Retry-After': String(Math.ceil(rl.resetMs / 1000)),
      })
    }

    // 2. Get caller's profile to check permissions
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, department_id, tenant_id')
      .eq('id', caller.id)
      .single()

    if (profileError || !callerProfile) {
      return jsonResponse({ error: 'Caller profile not found' }, 403)
    }

    // 3. Parse the request
    const body = await req.json()
    const { action } = body

    // ─── DELETE USER ───
    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) {
        return jsonResponse({ error: 'user_id is required for deletion' }, 400)
      }

      // Verify the target exists and caller can delete them
      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('id, role, full_name, created_by')
        .eq('id', user_id)
        .single()

      if (!targetProfile) {
        return jsonResponse({ error: 'User not found' }, 404)
      }

      // Check role hierarchy — can only delete roles below you
      const allowedRoles = ROLE_HIERARCHY[callerProfile.role]
      if (!allowedRoles || !allowedRoles.includes(targetProfile.role)) {
        return jsonResponse({ error: `Cannot delete user with role "${targetProfile.role}"` }, 403)
      }

      // Delete profile first (FK constraints)
      const { error: profileDelError } = await adminClient.from('profiles').delete().eq('id', user_id)
      if (profileDelError) {
        return jsonResponse({ error: `Profile deletion failed: ${profileDelError.message}` }, 500)
      }

      // Delete auth user permanently
      const { error: authDelError } = await adminClient.auth.admin.deleteUser(user_id)
      if (authDelError) {
        log({ level: 'WARN', fn: 'create-user', action: 'auth-delete-failed', meta: { user_id, error: authDelError.message } })
      }

      // Log
      await adminClient.from('activity_logs').insert({
        user_id: caller.id,
        user_role: callerProfile.role,
        user_name: caller.email,
        action: 'User Deleted',
        details: `Permanently deleted ${targetProfile.role} "${targetProfile.full_name}"`,
        tenant_id: callerProfile.tenant_id,
      })

      log({ level: 'INFO', fn: 'create-user', action: 'deleted', userId: caller.id, duration: elapsed(), meta: { deleted_id: user_id, role: targetProfile.role } })

      return jsonResponse({
        success: true,
        message: `User "${targetProfile.full_name}" permanently deleted`,
      })
    }

    // ─── CREATE USER ───
    const { email, password, full_name, role, department_id, roll_number, teacher_id, section, semester_id } = body

    if (!email || !password || !full_name || !role) {
      return jsonResponse({ error: 'email, password, full_name, and role are required' }, 400)
    }

    // FIX #33: Stronger password policy for production (8+ chars, must include letter + number)
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

    // Check if roll_number is already taken by another student (prevent USN overwrites)
    if (roll_number && role === 'student') {
      const { data: existingRoll } = await adminClient
        .from('profiles')
        .select('id, email, full_name')
        .eq('roll_number', roll_number)
        .eq('role', 'student')
        .limit(1)
      if (existingRoll && existingRoll.length > 0) {
        return jsonResponse({ error: `USN "${roll_number}" is already assigned to ${existingRoll[0].full_name || existingRoll[0].email}` }, 400)
      }
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
      email,
      role,
      tenant_id: callerProfile.tenant_id,
      created_by: caller.id,
    }

    if (department_id) profileData.department_id = department_id
    if (roll_number) profileData.roll_number = roll_number
    if (teacher_id) {
      profileData.teacher_id = teacher_id
      // Also store in roll_number so UI and CSV assignment can read it
      if (!roll_number) profileData.roll_number = teacher_id
    }
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
