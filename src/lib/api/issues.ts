import { supabase } from '../supabase';

// ─── Types ───

export interface IssueFormData {
  category: string;
  severity: string;
  description: string;
  page_name?: string;
}

export interface ReportedIssue {
  id: string;
  issue_id: string;
  tenant_id: string | null;
  reporter_id: string | null;
  reporter_name: string;
  reporter_email: string;
  reporter_role: string;
  category: string;
  severity: string;
  description: string;
  page_url: string | null;
  page_name: string | null;
  browser_info: string | null;
  os_info: string | null;
  device_info: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface IssueFilters {
  status?: string;
  severity?: string;
  tenant_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface IssueStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
}

// ─── Auto-collected device info ───

function getDeviceInfo() {
  return {
    browser_info: navigator.userAgent,
    os_info: navigator.platform || 'Unknown',
    device_info: `${screen.width}x${screen.height} (${window.devicePixelRatio || 1}x DPR)`,
    page_url: window.location.href,
  };
}

// ─── API Functions ───

/**
 * Submit a new issue report (any authenticated user)
 */
export async function submitIssue(
  formData: IssueFormData,
  profile: { id: string; full_name: string; email?: string; role: string; tenant_id?: string }
): Promise<void> {
  const device = getDeviceInfo();

  // Get email from auth if not in profile
  let email = profile.email || '';
  if (!email) {
    const { data } = await supabase.auth.getUser();
    email = data.user?.email || 'unknown';
  }

  const { error } = await supabase.from('reported_issues').insert({
    reporter_id: profile.id,
    reporter_name: profile.full_name || 'Unknown',
    reporter_email: email,
    reporter_role: profile.role || 'unknown',
    tenant_id: profile.tenant_id || null,
    category: formData.category,
    severity: formData.severity,
    description: formData.description,
    page_name: formData.page_name || null,
    page_url: device.page_url,
    browser_info: device.browser_info,
    os_info: device.os_info,
    device_info: device.device_info,
  });

  if (error) throw error;
}

/**
 * Get all issues (SuperAdmin — uses service role client passed in)
 */
export async function getIssues(
  client: typeof supabase,
  filters?: IssueFilters
): Promise<ReportedIssue[]> {
  let query = client
    .from('reported_issues')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters?.severity && filters.severity !== 'all') {
    query = query.eq('severity', filters.severity);
  }
  if (filters?.tenant_id && filters.tenant_id !== 'all') {
    query = query.eq('tenant_id', filters.tenant_id);
  }
  if (filters?.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters?.date_to) {
    query = query.lte('created_at', filters.date_to + 'T23:59:59');
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ReportedIssue[];
}

/**
 * Update issue status (SuperAdmin)
 */
export async function updateIssueStatus(
  client: typeof supabase,
  id: string,
  status: string
): Promise<void> {
  const { error } = await client
    .from('reported_issues')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Delete an issue (SuperAdmin)
 */
export async function deleteIssue(
  client: typeof supabase,
  id: string
): Promise<void> {
  const { error } = await client
    .from('reported_issues')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * Get issue statistics (SuperAdmin)
 */
export async function getIssueStats(
  client: typeof supabase
): Promise<IssueStats> {
  const { data, error } = await client
    .from('reported_issues')
    .select('status');

  if (error) throw error;

  const issues = data || [];
  return {
    total: issues.length,
    open: issues.filter(i => i.status === 'open').length,
    in_progress: issues.filter(i => i.status === 'in_progress').length,
    resolved: issues.filter(i => i.status === 'resolved').length,
  };
}
