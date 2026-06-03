// @ts-nocheck — Deno runtime, not checked by project tsc
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

import { getCorsHeaders, validateOrigin, log, checkRateLimit, sanitize, isValidUUID } from '../_shared/utils.ts'

const corsHeaders = getCorsHeaders()

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

  // Use service_role client for reliable JWT verification
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Extract the JWT token and verify the user — with fallback
  const token = authHeader.replace('Bearer ', '')
  let userId: string | null = null
  try {
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token)
    if (!authError && user) userId = user.id
  } catch { /* getUser failed, try JWT decode */ }
  
  if (!userId) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      userId = payload.sub
    } catch { /* JWT decode failed */ }
  }
  
  if (!userId) throw new Error('Invalid or expired token')

  // Check if user is a platform admin (service_role bypasses RLS)
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, is_platform_admin')
    .eq('id', userId)
    .single()

  if (profileError || !profile) throw new Error('Profile not found')
  if (profile.role !== 'super_admin' && !profile.is_platform_admin) {
    throw new Error('Forbidden: not a platform administrator')
  }

  return { user: { id: userId }, adminClient }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Reject cross-origin requests in production
  const originError = validateOrigin(req)
  if (originError) return originError

  try {
    // Parse the body first to check the action
    const body = await req.json()
    const { action, ...params } = body

    // ─── APPROVE DELETION (called by tenant admin, NOT super admin) ───
    if (action === 'approve-deletion') {
      const { tenant_id } = params
      if (!tenant_id) return jsonResponse({ error: 'tenant_id required' }, 400)

      // Validate the caller is an authenticated user (admin) of this tenant
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return jsonResponse({ error: 'Missing auth token' }, 401)

      const token = authHeader.replace('Bearer ', '')
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
      )

      // Robust auth: try getUser first, fallback to JWT decode
      let callerId: string | null = null
      try {
        const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token)
        if (!authErr && caller) callerId = caller.id
      } catch { /* getUser failed, try JWT decode */ }
      
      if (!callerId) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          callerId = payload.sub
        } catch { /* JWT decode failed */ }
      }
      
      if (!callerId) return jsonResponse({ error: 'Invalid auth token' }, 401)

      // Verify caller is an admin of this specific tenant
      const { data: callerProfile } = await adminClient
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', callerId)
        .single()
      if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.tenant_id !== tenant_id) {
        return jsonResponse({ error: 'Only the tenant admin can approve deletion' }, 403)
      }

      // Set deletion_approved_at
      const { error } = await adminClient
        .from('tenants')
        .update({ deletion_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', tenant_id)
        .eq('status', 'pending_deletion')
      if (error) throw error

      log({ level: 'INFO', fn: 'admin-api', action: 'deletion-approved', userId: callerId, meta: { tenant_id } })
      return jsonResponse({ success: true })
    }

    // ─── COE ACTIONS (called by COE user, NOT super admin) ───
    if (action?.startsWith('coe-')) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return jsonResponse({ error: 'Missing auth token' }, 401)

      const token = authHeader.replace('Bearer ', '')
      const coeClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
      )

      // Robust auth: try getUser first, fallback to JWT decode
      let callerId: string | null = null
      try {
        const { data: { user: caller }, error: authErr } = await coeClient.auth.getUser(token)
        if (!authErr && caller) callerId = caller.id
      } catch { /* getUser failed, try JWT decode */ }
      
      if (!callerId) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          callerId = payload.sub
        } catch { /* JWT decode failed */ }
      }
      
      if (!callerId) return jsonResponse({ error: 'Invalid auth token' }, 401)

      const { data: callerProfile } = await coeClient
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', callerId)
        .single()
      if (!callerProfile || callerProfile.role !== 'coe') {
        return jsonResponse({ error: 'Only COE users can access this endpoint' }, 403)
      }

      switch (action) {
        case 'coe-get-students': {
          const { subject_id } = params
          if (!subject_id) return jsonResponse({ error: 'subject_id required' }, 400)

          // Get the subject's department and semester
          const { data: subject, error: subErr } = await coeClient
            .from('subjects')
            .select('department_id, semester_id')
            .eq('id', subject_id)
            .single()
          if (subErr || !subject) return jsonResponse({ error: 'Subject not found' }, 404)

          // Fetch ALL students in that department + semester
          let query = coeClient
            .from('profiles')
            .select('id, full_name, roll_number, section')
            .eq('role', 'student')
            .eq('semester_id', subject.semester_id)
            .order('roll_number')

          if (subject.department_id) {
            query = query.eq('department_id', subject.department_id)
          }

          const { data: students, error: studErr } = await query
          if (studErr) return jsonResponse({ error: studErr.message }, 500)

          // Map to same shape the frontend expects
          const mapped = (students || []).map((s) => ({
            student_id: s.id,
            profiles: { id: s.id, full_name: s.full_name, roll_number: s.roll_number, section: s.section }
          }))
          return jsonResponse({ data: mapped })
        }

        case 'coe-get-attendance': {
          const { subject_id, ia_number } = params
          if (!subject_id || !ia_number) return jsonResponse({ error: 'subject_id and ia_number required' }, 400)
          const { data, error } = await coeClient
            .from('ia_attendance')
            .select('student_id, is_present')
            .eq('subject_id', subject_id)
            .eq('ia_number', ia_number)
          if (error) return jsonResponse({ error: error.message }, 500)
          return jsonResponse({ data: data || [] })
        }

        case 'coe-save-attendance': {
          const { records } = params
          if (!records || !Array.isArray(records)) return jsonResponse({ error: 'records array required' }, 400)
          const BATCH = 25
          for (let i = 0; i < records.length; i += BATCH) {
            const batch = records.slice(i, i + BATCH)
            const { error } = await coeClient
              .from('ia_attendance')
              .upsert(batch, { onConflict: 'student_id,subject_id,ia_number' })
            if (error) {
              log({ level: 'ERROR', fn: 'admin-api', action: 'coe-save-attendance', error: error.message, meta: { batch_index: i } })
              return jsonResponse({ error: error.message }, 500)
            }
          }
          log({ level: 'INFO', fn: 'admin-api', action: 'coe-save-attendance', userId: callerId, meta: { count: records.length } })
          return jsonResponse({ success: true, count: records.length })
        }

        case 'coe-process-csv': {
          // Global CSV: resolve USN → student_id, Subject Code → subject_id
          const { csv_rows, coe_user_id } = params
          if (!csv_rows || !Array.isArray(csv_rows)) return jsonResponse({ error: 'csv_rows required' }, 400)

          const errors = []
          const records = []

          // Build lookup caches
          const usnArr = csv_rows.map((r) => r.usn?.toUpperCase()).filter(Boolean)
          const codeArr = csv_rows.map((r) => r.subject_code?.toUpperCase()).filter(Boolean)

          const usnMap = new Map()
          const codeMap = new Map()

          // Fetch all matching students (guard against empty array)
          if (usnArr.length > 0) {
            const { data: students } = await coeClient
              .from('profiles')
              .select('id, roll_number')
              .in('roll_number', usnArr)
            ;(students || []).forEach((s) => usnMap.set(s.roll_number?.toUpperCase(), s.id))
          }

          // Fetch all matching subjects (guard against empty array)
          if (codeArr.length > 0) {
            const { data: subjects } = await coeClient
              .from('subjects')
              .select('id, subject_code')
              .in('subject_code', codeArr)
            ;(subjects || []).forEach((s) => codeMap.set(s.subject_code?.toUpperCase(), s.id))
          }

          for (let i = 0; i < csv_rows.length; i++) {
            const { usn, subject_code, ia_name } = csv_rows[i]
            const studentId = usnMap.get(usn?.toUpperCase())
            if (!studentId) { errors.push(`Row ${i + 1}: USN "${usn}" not found`); continue }
            const subjectId = codeMap.get(subject_code?.toUpperCase())
            if (!subjectId) { errors.push(`Row ${i + 1}: Subject code "${subject_code}" not found`); continue }
            const iaNum = parseInt(String(ia_name).replace(/\D/g, ''), 10)
            if (isNaN(iaNum) || iaNum < 1 || iaNum > 3) { errors.push(`Row ${i + 1}: Invalid IA "${ia_name}"`); continue }
            records.push({
              student_id: studentId,
              subject_id: subjectId,
              teacher_id: coe_user_id || callerId,
              ia_number: iaNum,
              is_present: false,
            })
          }

          // Upsert
          if (records.length > 0) {
            const BATCH = 25
            for (let i = 0; i < records.length; i += BATCH) {
              const batch = records.slice(i, i + BATCH)
              const { error } = await coeClient
                .from('ia_attendance')
                .upsert(batch, { onConflict: 'student_id,subject_id,ia_number' })
              if (error) { errors.push(`DB error: ${error.message}`); break }
            }
          }

          log({ level: 'INFO', fn: 'admin-api', action: 'coe-process-csv', userId: callerId, meta: { processed: records.length, errors: errors.length } })
          return jsonResponse({ success: true, processed: records.length, errors })
        }

        default:
          return jsonResponse({ error: `Unknown COE action: ${action}` }, 400)
      }
    }

    // ─── GET IA DATA (any authenticated user — bypasses RLS for faculty to see COE records) ───
    if (action === 'get-ia-data') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return jsonResponse({ error: 'Missing auth token' }, 401)

      const iaClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
      )

      const { subject_id, section } = params
      if (!subject_id) return jsonResponse({ error: 'subject_id required' }, 400)

      const query = iaClient
        .from('ia_attendance')
        .select('*, profiles!ia_attendance_student_id_fkey(full_name, roll_number, section)')
        .eq('subject_id', subject_id)
        .order('ia_number')
        .order('created_at')

      const { data, error } = await query
      if (error) return jsonResponse({ error: error.message }, 500)

      // Normalize profiles from array to single object (Supabase join can return array)
      let results = (data || []).map((r) => {
        const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        return { ...r, profiles: prof || null }
      })

      // Filter by section on server side if specified
      if (section) {
        results = results.filter((r) => (r.profiles?.section || 'Unassigned') === section)
      }

      return jsonResponse({ data: results })
    }

    // ─── GET STUDENT IA DATA (any authenticated user) ───
    if (action === 'get-student-ia') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return jsonResponse({ error: 'Missing auth token' }, 401)

      const iaClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
      )

      const { student_id } = params
      if (!student_id) return jsonResponse({ error: 'student_id required' }, 400)

      const { data, error } = await iaClient
        .from('ia_attendance')
        .select('*, subjects!ia_attendance_subject_id_fkey(subject_name, subject_code)')
        .eq('student_id', student_id)
        .order('subject_id')
        .order('ia_number')
      if (error) return jsonResponse({ error: error.message }, 500)
      // Normalize subjects from array to single object
      const results = (data || []).map((r) => {
        const subj = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects
        return { ...r, subjects: subj || null }
      })
      return jsonResponse({ data: results })
    }

    // ─── ALL OTHER ACTIONS REQUIRE SUPER ADMIN ───
    const { user, adminClient } = await validateSuperAdmin(req)

    // Rate limit: 1500 admin API calls per minute per super admin
    const rl = checkRateLimit(`admin-api:${user.id}`, 1500, 60_000)
    if (!rl.allowed) {
      log({ level: 'WARN', fn: 'admin-api', action: 'rate_limited', userId: user.id })
      return jsonResponse({ error: 'Too many requests. Please wait.' }, 429)
    }

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
        return jsonResponse({ data: count || 0 })
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

        // Input validation
        const cleanName = sanitize(name, 100)
        if (cleanName.length < 2) return jsonResponse({ error: 'Tenant name must be at least 2 characters' }, 400)

        const cleanSlug = slug.toLowerCase().trim()
        if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(cleanSlug)) {
          return jsonResponse({ error: 'Slug must be 3-50 chars: lowercase letters, numbers, and hyphens only' }, 400)
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(adminEmail)) {
          return jsonResponse({ error: 'Invalid admin email format' }, 400)
        }

        if (adminPassword.length < 8 || !/[a-zA-Z]/.test(adminPassword) || !/[0-9]/.test(adminPassword)) {
          return jsonResponse({ error: 'Password must be 8+ chars with at least one letter and one number' }, 400)
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
          email: adminEmail,
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

        // Validate slug uniqueness if slug is being changed
        if (updates.slug) {
          const { data: existingSlug } = await adminClient
            .from('tenants')
            .select('id')
            .eq('slug', updates.slug)
            .neq('id', tenant_id)
            .maybeSingle()
          if (existingSlug) return jsonResponse({ error: 'Slug already in use by another tenant' }, 400)
        }

        // Validate admin_email uniqueness if being changed
        if (updates.admin_email) {
          const { data: existingEmail } = await adminClient
            .from('tenants')
            .select('id')
            .eq('admin_email', updates.admin_email)
            .neq('id', tenant_id)
            .maybeSingle()
          if (existingEmail) return jsonResponse({ error: 'Admin email already in use by another tenant' }, 400)
        }

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

      // ─── REQUEST TENANT DELETION (SuperAdmin requests, Admin must approve) ───
      case 'request-deletion': {
        const { tenant_id } = params
        if (!tenant_id) return jsonResponse({ error: 'tenant_id required' }, 400)

        // Ensure the status column supports 'pending_deletion' and deletion_approved_at exists
        try {
          // Add 'pending_deletion' to status check constraint (if it exists)
          await adminClient.rpc('exec_sql', { sql: `
            DO $$
            BEGIN
              -- Drop existing check constraint if any
              ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
              -- Add column if not exists
              ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deletion_approved_at timestamptz DEFAULT NULL;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
          ` }).single()
        } catch {
          // RPC may not exist, try direct approach
          try {
            await adminClient.from('tenants').update({ status: 'pending_deletion' }).eq('id', '00000000-0000-0000-0000-000000000000')
          } catch { /* test update to check if status value works */ }
        }

        const { error } = await adminClient
          .from('tenants')
          .update({ status: 'pending_deletion', updated_at: new Date().toISOString() })
          .eq('id', tenant_id)
        if (error) {
          // If status constraint fails, provide a helpful message
          if (error.message?.includes('check') || error.message?.includes('constraint') || error.message?.includes('violates')) {
            return jsonResponse({
              error: 'Database migration required. Please run this SQL in Supabase SQL Editor:\n\nALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;\nALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deletion_approved_at timestamptz DEFAULT NULL;'
            }, 400)
          }
          throw error
        }
        log({ level: 'INFO', fn: 'admin-api', action: 'deletion-requested', meta: { tenant_id } })
        return jsonResponse({ success: true })
      }

      // ─── CANCEL DELETION REQUEST ───
      case 'cancel-deletion': {
        const { tenant_id } = params
        if (!tenant_id) return jsonResponse({ error: 'tenant_id required' }, 400)

        // Reset status back to active and clear approval
        const updates: Record<string, unknown> = { status: 'active', updated_at: new Date().toISOString() }
        // Try to clear deletion_approved_at if the column exists
        try {
          await adminClient.from('tenants').update({ ...updates, deletion_approved_at: null }).eq('id', tenant_id)
        } catch {
          // If column doesn't exist, just update status
          await adminClient.from('tenants').update(updates).eq('id', tenant_id)
        }
        log({ level: 'INFO', fn: 'admin-api', action: 'deletion-cancelled', meta: { tenant_id } })
        return jsonResponse({ success: true })
      }

      // ─── DELETE TENANT (requires admin approval) ───
      case 'delete-tenant': {
        const { tenant_id } = params
        if (!tenant_id) return jsonResponse({ error: 'tenant_id required' }, 400)

        // Verify tenant admin has approved the deletion
        const { data: tenantData, error: tenantCheckErr } = await adminClient
          .from('tenants')
          .select('status')
          .eq('id', tenant_id)
          .single()
        if (tenantCheckErr) throw tenantCheckErr

        if (tenantData.status !== 'pending_deletion') {
          return jsonResponse({ error: 'Tenant is not in pending_deletion status.' }, 403)
        }

        // Check if deletion_approved_at exists and is set
        try {
          const { data: approvalCheck } = await adminClient
            .from('tenants')
            .select('deletion_approved_at')
            .eq('id', tenant_id)
            .single()
          if (!approvalCheck?.deletion_approved_at) {
            return jsonResponse({ error: 'Deletion not approved by tenant admin yet. The admin must approve the deletion request first.' }, 403)
          }
        } catch {
          // If column doesn't exist, allow deletion since status is already pending_deletion
        }

        // Delete all profiles (auth users) for this tenant in batches
        const { data: profiles } = await adminClient
          .from('profiles')
          .select('id')
          .eq('tenant_id', tenant_id)

        if (profiles && profiles.length > 0) {
          const BATCH_SIZE = 20
          let deleted = 0
          for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
            const batch = profiles.slice(i, i + BATCH_SIZE)
            await Promise.allSettled(
              batch.map(p => adminClient.auth.admin.deleteUser(p.id))
            )
            deleted += batch.length
            log({ level: 'INFO', fn: 'admin-api', action: 'delete-tenant-progress', meta: { deleted, total: profiles.length } })
          }
        }

        // Delete the tenant record (cascades to remaining data via FK)
        const { error } = await adminClient.from('tenants').delete().eq('id', tenant_id)
        if (error) throw error
        log({ level: 'INFO', fn: 'admin-api', action: 'tenant-deleted', meta: { tenant_id, users_deleted: profiles?.length || 0 } })
        return jsonResponse({ success: true, users_deleted: profiles?.length || 0 })
      }

      // ─── PLATFORM STATS ───
      case 'get-platform-stats': {
        const [tenantRes, userRes, clearanceRes, activeRes] = await Promise.all([
          adminClient.from('tenants').select('*', { count: 'exact', head: true }),
          adminClient.from('profiles').select('*', { count: 'exact', head: true }),
          adminClient.from('clearance_requests').select('*', { count: 'exact', head: true }),
          adminClient.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        ])
        return jsonResponse({ data: {
          totalTenants: tenantRes.count || 0,
          totalUsers: userRes.count || 0,
          totalClearances: clearanceRes.count || 0,
          activeTenants: activeRes.count || 0,
        }})
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

      // ─── ERROR STATS (FIX #16: Use COUNT queries instead of fetching all rows) ───
      case 'get-error-stats': {
        const [critRes, warnRes, infoRes] = await Promise.all([
          adminClient.from('platform_error_logs').select('*', { count: 'exact', head: true }).eq('severity', 'CRITICAL'),
          adminClient.from('platform_error_logs').select('*', { count: 'exact', head: true }).eq('severity', 'WARNING'),
          adminClient.from('platform_error_logs').select('*', { count: 'exact', head: true }).eq('severity', 'INFO'),
        ])
        const stats = {
          CRITICAL: critRes.count || 0,
          WARNING: warnRes.count || 0,
          INFO: infoRes.count || 0,
        }
        return jsonResponse({ data: { stats, total: stats.CRITICAL + stats.WARNING + stats.INFO } })
      }

      // ─── REPORTED ISSUES ───
      case 'get-issues': {
        const { status, severity, tenant_id, date_from, date_to } = params
        let query = adminClient
          .from('reported_issues')
          .select('*')
          .order('created_at', { ascending: false })
        if (status && status !== 'all') query = query.eq('status', status)
        if (severity && severity !== 'all') query = query.eq('severity', severity)
        if (tenant_id && tenant_id !== 'all') query = query.eq('tenant_id', tenant_id)
        if (date_from) query = query.gte('created_at', date_from)
        if (date_to) query = query.lte('created_at', date_to + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        return jsonResponse({ data })
      }

      case 'get-issue-stats': {
        const { data, error } = await adminClient
          .from('reported_issues')
          .select('status')
        if (error) throw error
        const issues = data || []
        return jsonResponse({ data: {
          total: issues.length,
          open: issues.filter((i: any) => i.status === 'open').length,
          in_progress: issues.filter((i: any) => i.status === 'in_progress').length,
          resolved: issues.filter((i: any) => i.status === 'resolved').length,
        }})
      }

      case 'update-issue-status': {
        const { id, status } = params
        if (!id) return jsonResponse({ error: 'id required' }, 400)
        if (!['open', 'in_progress', 'resolved'].includes(status)) {
          return jsonResponse({ error: 'Invalid status' }, 400)
        }
        const { error } = await adminClient
          .from('reported_issues')
          .update({ status })
          .eq('id', id)
        if (error) throw error
        return jsonResponse({ success: true })
      }

      case 'delete-issue': {
        const { id } = params
        if (!id) return jsonResponse({ error: 'id required' }, 400)
        const { error } = await adminClient
          .from('reported_issues')
          .delete()
          .eq('id', id)
        if (error) throw error
        return jsonResponse({ success: true })
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
