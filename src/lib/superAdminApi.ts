/**
 * Super Admin API — Secure Client Layer
 *
 * All operations are proxied through the `admin-api` Edge Function
 * which validates the caller's JWT and uses service_role server-side.
 * NO service_role key exists in this file or the browser bundle.
 */
import { supabase } from './supabase';

type AdminApiResponse<T = unknown> = { data?: T; error?: string };

/**
 * Invoke the admin-api Edge Function with JWT auth.
 */
async function invokeAdminApi<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action, ...params },
  });

  if (error) {
    throw new Error(error.message || 'Admin API request failed');
  }

  const response = data as AdminApiResponse<T>;
  if (response.error) {
    throw new Error(response.error);
  }

  return response.data as T;
}

// ─── Tenant Management ───

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  admin_email: string;
  max_users: number;
  logo_url: string | null;
  primary_color: string;
  created_at: string;
  updated_at: string;
  userCount?: number;
};

export async function getAllTenants(): Promise<Tenant[]> {
  return invokeAdminApi<Tenant[]>('list-tenants');
}

export async function getTenantUserCount(tenantId: string): Promise<number> {
  const result = await invokeAdminApi<number>('get-tenant-user-count', { tenant_id: tenantId });
  return result ?? 0;
}

export async function getTenantDetails(tenantId: string) {
  return invokeAdminApi('get-tenant-details', { tenant_id: tenantId });
}

export async function provisionTenant(params: {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  plan?: string;
  maxUsers?: number;
}): Promise<{ success: boolean; tenant_id: string; user_id: string }> {
  return invokeAdminApi('create-tenant', params);
}

export async function editTenant(tenantId: string, updates: Record<string, unknown>) {
  return invokeAdminApi('edit-tenant', { tenant_id: tenantId, ...updates });
}

export async function toggleTenantStatus(tenantId: string, status: 'active' | 'suspended') {
  return invokeAdminApi('toggle-status', { tenant_id: tenantId, status });
}

export async function deleteTenant(tenantId: string) {
  return invokeAdminApi('delete-tenant', { tenant_id: tenantId });
}

// ─── Platform Stats ───

export type PlatformStats = {
  totalTenants: number;
  totalUsers: number;
  totalClearances: number;
  activeTenants: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  return invokeAdminApi<PlatformStats>('get-platform-stats');
}

// ─── Error Logs ───

export type PlatformError = {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  dashboard_name: string;
  nav_path: string | null;
  error_code: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  error_detail: string;
  triggered_by_role: string | null;
  triggered_by_email: string | null;
  created_at: string;
};

export async function getPlatformErrors(filters?: {
  severity?: string;
  dashboard?: string;
  limit?: number;
}): Promise<PlatformError[]> {
  return invokeAdminApi<PlatformError[]>('get-errors', filters || {});
}

export async function getErrorStats(): Promise<{ stats: Record<string, number>; total: number }> {
  return invokeAdminApi('get-error-stats');
}

// ─── Error Logging (for frontend error handler) ───

export async function logPlatformError(errorData: {
  dashboard_name: string;
  error_code: string;
  severity: string;
  error_detail: string;
  nav_path?: string;
  triggered_by_role?: string;
  triggered_by_email?: string;
}) {
  try {
    // Use the log-error Edge Function (which uses service_role internally)
    await supabase.functions.invoke('log-error', { body: errorData });
  } catch {
    // Never let error logging crash the app
    console.error('Failed to log platform error');
  }
}
