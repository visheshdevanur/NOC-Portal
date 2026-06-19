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
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin') || '') })
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

        // Check if user already exists by email
        const { data: existing } = await adminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .limit(1)

        if (existing && existing.length > 0) {
          // User already exists — update their profile data
          const updateData: Record<string, unknown> = { full_name }
          if (department_id) updateData.department_id = department_id
          if (roll_number) updateData.roll_number = roll_number
          if (section) updateData.section = section
          if (semester_id) updateData.semester_id = semester_id
          if (teacher_id) {
            updateData.teacher_id = teacher_id
            if (!roll_number) updateData.roll_number = teacher_id
          }
          const { error: updateErr } = await adminClient
            .from('profiles')
            .update(updateData)
            .eq('id', existing[0].id)
          if (updateErr) {
            return { row: rowNum, email, status: 'error' as const, error: `Update failed: ${updateErr.message}` }
          }
          return { row: rowNum, email, status: 'updated' as const }
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
            return { row: rowNum, email, status: 'error' as const, error: `USN "${roll_number}" already assigned to ${existingRoll[0].full_name || existingRoll[0].email}` }
          }
        }

        // Create auth user
        let authData: any = null
        const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role, tenant_id: callerProfile.tenant_id },
          app_metadata: { tenant_id: callerProfile.tenant_id },
        })

        if (createError) {
          // Handle orphaned auth user (profile was deleted but auth.users entry remains)
          if (createError.message?.includes('already been registered')) {
            // Find the orphaned auth user by email
            const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1, page: 1 })
            // Search by email directly
            const { data: userList } = await adminClient
              .from('profiles')
              .select('id')
              .eq('email', email)
              .limit(1)
            
            // Profile doesn't exist, so this is an orphaned auth user — delete and recreate
            if (!userList || userList.length === 0) {
              // Use getUserByEmail-like approach: list and find
              try {
                // Try to get user by signing in to get their ID (won't work), 
                // Instead, delete via admin API by listing
                const allAuthUsers = await adminClient.auth.admin.listUsers({ perPage: 1000 })
                const orphan = allAuthUsers.data?.users?.find((u: any) => u.email === email)
                if (orphan) {
                  await adminClient.auth.admin.deleteUser(orphan.id)
                  // Retry creation
                  const { data: retryData, error: retryError } = await adminClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: { role, tenant_id: callerProfile.tenant_id },
                    app_metadata: { tenant_id: callerProfile.tenant_id },
                  })
                  if (retryError) {
                    return { row: rowNum, email, status: 'error' as const, error: retryError.message }
                  }
                  authData = retryData
                } else {
                  return { row: rowNum, email, status: 'error' as const, error: createError.message }
                }
              } catch {
                return { row: rowNum, email, status: 'error' as const, error: createError.message }
              }
            } else {
              return { row: rowNum, email, status: 'error' as const, error: createError.message }
            }
          } else {
            return { row: rowNum, email, status: 'error' as const, error: createError.message }
          }
        } else {
          authData = createData
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
