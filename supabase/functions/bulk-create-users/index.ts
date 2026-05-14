// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { log, startTimer, getCorsHeaders, jsonResponse, validateOrigin } from '../_shared/utils.ts'

const corsHeaders = getCorsHeaders()

const ROLE_HIERARCHY: Record<string, string[]> = {
  admin: ['hod', 'staff', 'faculty', 'teacher', 'accounts', 'librarian', 'principal', 'fyc', 'clerk', 'student'],
  hod: ['staff', 'faculty', 'teacher', 'student'],
  fyc: ['clerk', 'teacher'],
  staff: ['teacher', 'student'],
  clerk: ['teacher', 'student'],
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const originError = validateOrigin(req)
  if (originError) return originError

  try {
    const elapsed = startTimer()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Validate caller JWT
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

    // Get caller profile
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, department_id, tenant_id')
      .eq('id', caller.id)
      .single()

    if (profileError || !callerProfile) {
      return jsonResponse({ error: 'Caller profile not found' }, 403)
    }

    const allowedRoles = ROLE_HIERARCHY[callerProfile.role]
    if (!allowedRoles) {
      return jsonResponse({ error: `Your role (${callerProfile.role}) cannot create users` }, 403)
    }

    // Parse request — expects { users: [...] }
    const { users } = await req.json()
    if (!Array.isArray(users) || users.length === 0) {
      return jsonResponse({ error: 'users array is required' }, 400)
    }
    if (users.length > 500) {
      return jsonResponse({ error: 'Maximum 500 users per batch' }, 400)
    }

    const results: { row: number; email: string; status: 'created' | 'updated' | 'error'; error?: string }[] = []

    // Process in server-side parallel batches of 25
    const SERVER_BATCH = 25
    for (let b = 0; b < users.length; b += SERVER_BATCH) {
      const batch = users.slice(b, b + SERVER_BATCH)

      const batchResults = await Promise.allSettled(batch.map(async (u: any, idx: number) => {
        const rowNum = b + idx
        const { email, password, full_name, role, department_id, roll_number, teacher_id, section, semester_id } = u

        if (!email || !password || !full_name || !role) {
          return { row: rowNum, email: email || '', status: 'error' as const, error: 'Missing required fields' }
        }

        if (!allowedRoles.includes(role)) {
          return { row: rowNum, email, status: 'error' as const, error: `Cannot create role "${role}"` }
        }

        // Check if user already exists
        const { data: existing } = await adminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .limit(1)

        if (existing && existing.length > 0) {
          // User already exists — DO NOT overwrite their data.
          // Skip to prevent accidental semester/section/department changes.
          return { row: rowNum, email, status: 'updated' as const, error: 'Already exists — skipped' }
        }

        // Create auth user
        const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role, tenant_id: callerProfile.tenant_id },
          app_metadata: { tenant_id: callerProfile.tenant_id },
        })

        if (createError) {
          return { row: rowNum, email, status: 'error' as const, error: createError.message }
        }

        if (!authData.user) {
          return { row: rowNum, email, status: 'error' as const, error: 'Auth user creation failed' }
        }

        // Create profile
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
          if (!roll_number) profileData.roll_number = teacher_id
        }
        if (section) profileData.section = section
        if (semester_id) profileData.semester_id = semester_id

        const { error: insertError } = await adminClient.from('profiles').insert(profileData)
        if (insertError) {
          await adminClient.auth.admin.deleteUser(authData.user.id)
          return { row: rowNum, email, status: 'error' as const, error: insertError.message }
        }

        return { row: rowNum, email, status: 'created' as const }
      }))

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({ row: -1, email: '', status: 'error', error: result.reason?.message || 'Unknown error' })
        }
      }
    }

    const created = results.filter(r => r.status === 'created').length
    const updated = results.filter(r => r.status === 'updated').length
    const errors = results.filter(r => r.status === 'error')

    log({ level: 'INFO', fn: 'bulk-create-users', action: 'completed', userId: caller.id, duration: elapsed(), meta: { total: users.length, created, updated, errors: errors.length } })

    return jsonResponse({
      data: { created, updated, errors: errors.length, total: users.length },
      errorDetails: errors.slice(0, 50),
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    log({ level: 'ERROR', fn: 'bulk-create-users', action: 'failed', error: message })
    return jsonResponse({ error: message }, 500)
  }
})
