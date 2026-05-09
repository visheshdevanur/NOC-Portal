/**
 * Super Admin Auth — Real Supabase Authentication
 *
 * FIX #22: Uses a SEPARATE Supabase client to prevent session collision.
 * A super admin is a user with `is_platform_admin = true` in their profile.
 */
import { superAdminSupabase } from './superAdminSupabase';

/**
 * Login as a super admin using real Supabase auth.
 * Returns the user on success, throws on failure.
 */
export async function superAdminLogin(email: string, password: string) {
  const { data, error } = await superAdminSupabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Login failed');

  // Verify this user is actually a platform admin
  // Uses SECURITY DEFINER RPC to bypass tenant RLS (superadmin has no tenant_id)
  const { data: rpcResult, error: rpcError } = await superAdminSupabase
    .rpc('get_my_profile_for_auth');

  const profile = rpcResult?.[0] || rpcResult;

  if (rpcError || !profile) {
    await superAdminSupabase.auth.signOut();
    throw new Error('Profile not found');
  }

  if (profile.role !== 'super_admin' && !profile.is_platform_admin) {
    await superAdminSupabase.auth.signOut();
    throw new Error('Access denied: not a platform administrator');
  }

  return data.user;
}

/**
 * Check if the current session belongs to a super admin.
 */
export async function isSuperAdminLoggedIn(): Promise<boolean> {
  const { data: { session } } = await superAdminSupabase.auth.getSession();
  if (!session) return false;

  const { data: rpcResult } = await superAdminSupabase
    .rpc('get_my_profile_for_auth');

  const profile = rpcResult?.[0] || rpcResult;
  return !!(profile?.is_platform_admin || profile?.role === 'super_admin');
}

/**
 * Sign out the super admin.
 */
export async function superAdminLogout() {
  await superAdminSupabase.auth.signOut();
}
