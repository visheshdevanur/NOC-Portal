/**
 * Super Admin authentication — client-side gate using env variables.
 * The actual security is via the Supabase service_role key which bypasses RLS.
 */

const SUPER_ADMIN_EMAIL = import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'superadmin@nocportal.dev';
const SUPER_ADMIN_PASSWORD = import.meta.env.VITE_SUPER_ADMIN_PASSWORD || 'SuperAdmin@2026!';

export function validateSuperAdmin(email: string, password: string): boolean {
  return email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD;
}

export function isSuperAdminLoggedIn(): boolean {
  return sessionStorage.getItem('superadmin_session') === 'active';
}

export function loginSuperAdmin(): void {
  sessionStorage.setItem('superadmin_session', 'active');
}

export function logoutSuperAdmin(): void {
  sessionStorage.removeItem('superadmin_session');
}
