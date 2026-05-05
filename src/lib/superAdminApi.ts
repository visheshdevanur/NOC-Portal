import { supabaseAdmin } from './supabaseAdmin';

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  admin_email: string;
  max_users: number;
  logo_url: string | null;
  primary_color: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantStats = {
  totalTenants: number;
  totalUsers: number;
  totalClearances: number;
  activeTenants: number;
};

/** Fetch all tenants */
export async function getAllTenants(): Promise<Tenant[]> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Get a single tenant by ID */
export async function getTenantById(id: string): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/** Get user count per tenant */
export async function getTenantUserCount(tenantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return count || 0;
}

/** Get clearance count per tenant */
export async function getTenantClearanceCount(tenantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('clearance_requests')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return count || 0;
}

/** Get global platform stats */
export async function getPlatformStats(): Promise<TenantStats> {
  const [tenantsRes, usersRes, clearancesRes, activeRes] = await Promise.all([
    supabaseAdmin.from('tenants').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('clearance_requests').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ]);
  return {
    totalTenants: tenantsRes.count || 0,
    totalUsers: usersRes.count || 0,
    totalClearances: clearancesRes.count || 0,
    activeTenants: activeRes.count || 0,
  };
}

/** Create a new tenant + admin user */
export async function provisionTenant(params: {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  plan: string;
  maxUsers: number;
}): Promise<{ tenantId: string; userId: string }> {
  // Pre-validation: check admin email uniqueness
  const { data: existingEmail } = await supabaseAdmin
    .from('tenants')
    .select('name')
    .eq('admin_email', params.adminEmail)
    .maybeSingle();
  if (existingEmail) {
    throw new Error(`This email is already assigned as an admin to "${existingEmail.name}".`);
  }

  // Pre-validation: check slug uniqueness
  const { data: existingSlug } = await supabaseAdmin
    .from('tenants')
    .select('name')
    .eq('slug', params.slug)
    .maybeSingle();
  if (existingSlug) {
    throw new Error(`The slug "${params.slug}" is already taken by "${existingSlug.name}".`);
  }

  // 1. Create the tenant row
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .insert({
      name: params.name,
      slug: params.slug,
      plan: params.plan,
      status: 'active',
      admin_email: params.adminEmail,
      max_users: params.maxUsers,
    })
    .select()
    .single();
  if (tenantErr) throw tenantErr;

  // 2. Create the admin user in Supabase Auth
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: params.adminEmail,
    password: params.adminPassword,
    email_confirm: true,
    user_metadata: { role: 'admin', tenant_id: tenant.id },
  });
  if (authErr) throw authErr;

  // 3. Insert admin profile
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      full_name: `Admin - ${params.name}`,
      role: 'admin',
      tenant_id: tenant.id,
    });
  if (profileErr) throw profileErr;

  // 4. Seed a default department
  await supabaseAdmin.from('departments').insert({
    name: 'General',
    tenant_id: tenant.id,
  });

  return { tenantId: tenant.id, userId: authData.user.id };
}

/** Toggle tenant status between active/suspended */
export async function toggleTenantStatus(tenantId: string, newStatus: 'active' | 'suspended') {
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', tenantId);
  if (error) throw error;
}

/** Delete a tenant (careful!) */
export async function deleteTenant(tenantId: string) {
  const { error } = await supabaseAdmin
    .from('tenants')
    .delete()
    .eq('id', tenantId);
  if (error) throw error;
}

/** Get all users for a specific tenant */
export async function getTenantUsers(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role, roll_number, section, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Get recent activity logs across all tenants */
export async function getGlobalActivityLogs(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from('activity_logs')
    .select('*, tenants!activity_logs_tenant_id_fkey(name, slug)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // Fallback without join if FK doesn't exist
    const { data: fallback, error: err2 } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (err2) throw err2;
    return fallback || [];
  }
  return data || [];
}

// ─── Platform Error Logs ───────────────────────────────────────────────────────

export type PlatformErrorSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type PlatformError = {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  dashboard_name: string;
  nav_path: string | null;
  error_code: string;
  severity: PlatformErrorSeverity;
  error_detail: string;
  triggered_by_role: string | null;
  triggered_by_email: string | null;
  created_at: string;
};

export type ErrorFilters = {
  tenant_id?: string;
  dashboard_name?: string;
  severity?: PlatformErrorSeverity;
  role?: string;
  error_code?: string;
  date_from?: string;  // ISO string
  date_to?: string;    // ISO string
  limit?: number;
};

export type ErrorStats = {
  critical: number;
  warning: number;
  info: number;
  total: number;
};

/**
 * Fetch platform error logs with optional filters.
 * Uses the service_role client — only callable from the SuperAdmin portal.
 */
export async function getPlatformErrors(filters: ErrorFilters = {}): Promise<PlatformError[]> {
  let query = supabaseAdmin
    .from('platform_error_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.tenant_id)     query = query.eq('tenant_id', filters.tenant_id);
  if (filters.dashboard_name) query = query.eq('dashboard_name', filters.dashboard_name);
  if (filters.severity)      query = query.eq('severity', filters.severity);
  if (filters.role)          query = query.eq('triggered_by_role', filters.role);
  if (filters.error_code)    query = query.ilike('error_code', `%${filters.error_code}%`);
  if (filters.date_from)     query = query.gte('created_at', filters.date_from);
  if (filters.date_to)       query = query.lte('created_at', filters.date_to);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as PlatformError[];
}

/**
 * Get counts by severity for the portal header badge.
 */
export async function getErrorStats(): Promise<ErrorStats> {
  const { data, error } = await supabaseAdmin
    .from('platform_error_logs')
    .select('severity');
  if (error) throw error;

  const counts = { critical: 0, warning: 0, info: 0, total: 0 };
  (data || []).forEach((row: { severity: string }) => {
    counts.total++;
    if (row.severity === 'CRITICAL') counts.critical++;
    else if (row.severity === 'WARNING') counts.warning++;
    else if (row.severity === 'INFO') counts.info++;
  });
  return counts;
}

/**
 * Write an error log entry via the `log-error` Edge Function.
 * This is the ONLY way the frontend should write error logs —
 * never using the service key directly for writes.
 *
 * Callers: validation error handlers in ClerkDashboard, HodDashboard, etc.
 * (wired in the next phase — available here for future use)
 */
export async function logPlatformError(payload: {
  tenant_id?: string;
  tenant_name?: string;
  dashboard_name: string;
  nav_path?: string;
  error_code: string;
  severity?: PlatformErrorSeverity;
  error_detail: string;
  triggered_by_role?: string;
  triggered_by_email?: string;
}): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  // Call the Edge Function using the anon key — the function itself uses service_role internally
  const res = await fetch(`${supabaseUrl}/functions/v1/log-error`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // Silently fail — never let error logging crash the user's flow
    console.warn('[logPlatformError] Edge Function call failed:', await res.text().catch(() => ''));
  }
}
