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
