import { useState, useEffect, useMemo } from 'react';
import { Flag, Search, Filter, ChevronDown, ChevronUp, Trash2, Eye, Clock, CheckCircle2, AlertCircle, BarChart3, ArrowUpDown, Globe, Monitor, Smartphone } from 'lucide-react';
import { useSATheme } from './SuperAdminApp';
import { getIssues, getIssueStats, updateIssueStatus, deleteIssue } from '../../lib/api/issues';
import type { ReportedIssue, IssueFilters, IssueStats } from '../../lib/api/issues';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const statusColors: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_progress: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const categoryLabels: Record<string, string> = {
  ui_bug: 'UI Bug',
  performance: 'Performance',
  wrong_data: 'Wrong Data',
  feature_broken: 'Feature Broken',
  access_issue: 'Access Issue',
  other: 'Other',
};

interface Props {
  serviceClient: any;
}

export default function ReportedIssuesPage({ serviceClient }: Props) {
  const { theme } = useSATheme();
  const isDark = theme === 'dark';

  const [issues, setIssues] = useState<ReportedIssue[]>([]);
  const [stats, setStats] = useState<IssueStats>({ total: 0, open: 0, in_progress: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<IssueFilters>({});
  const [sortKey, setSortKey] = useState<string>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [issueData, statsData] = await Promise.all([
        getIssues(serviceClient, filters),
        getIssueStats(serviceClient),
      ]);
      setIssues(issueData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch issues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filters]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await updateIssueStatus(serviceClient, id, newStatus);
      setIssues(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
      setStats(prev => {
        const old = issues.find(i => i.id === id);
        if (!old) return prev;
        const s = { ...prev };
        s[old.status as keyof IssueStats]--;
        s[newStatus as keyof IssueStats]++;
        return s;
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this issue report? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteIssue(serviceClient, id);
      setIssues(prev => prev.filter(i => i.id !== id));
      const deleted = issues.find(i => i.id === id);
      if (deleted) {
        setStats(prev => ({
          ...prev,
          total: prev.total - 1,
          [deleted.status as keyof IssueStats]: (prev[deleted.status as keyof IssueStats] as number) - 1,
        }));
      }
    } catch (err) {
      console.error('Failed to delete issue:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    let list = [...issues];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.issue_id.toLowerCase().includes(q) ||
        i.reporter_name.toLowerCase().includes(q) ||
        i.reporter_email.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
      );
    }
    list.sort((a: any, b: any) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [issues, searchQuery, sortKey, sortAsc]);

  const bg = isDark ? '#0a0a0f' : '#f8fafc';
  const card = isDark ? '#111118' : '#ffffff';
  const border = isDark ? '#1e1e2e' : '#e2e8f0';
  const text = isDark ? '#e2e8f0' : '#1e293b';
  const muted = isDark ? '#64748b' : '#94a3b8';

  const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: '20px 24px' }} className="flex items-center gap-4">
      <div style={{ background: color, borderRadius: 12, width: 48, height: 48 }} className="flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <p style={{ color: muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ color: text, fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{value}</p>
      </div>
    </div>
  );

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <th
      onClick={() => handleSort(field)}
      style={{ color: muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '12px 16px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={10} style={{ opacity: 0.3 }} />}
      </span>
    </th>
  );

  return (
    <div style={{ background: bg, minHeight: '100vh', padding: 32, color: text, fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', borderRadius: 14, width: 48, height: 48 }} className="flex items-center justify-center shadow-lg">
          <Flag size={24} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Reported Issues</h1>
          <p style={{ color: muted, fontSize: 13 }}>Track and manage user-reported issues across all tenants</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Reports" value={stats.total} icon={<BarChart3 size={22} color="#818cf8" />} color={isDark ? '#1e1b4b' : '#eef2ff'} />
        <StatCard label="Open" value={stats.open} icon={<AlertCircle size={22} color="#3b82f6" />} color={isDark ? '#172554' : '#dbeafe'} />
        <StatCard label="In Progress" value={stats.in_progress} icon={<Clock size={22} color="#f59e0b" />} color={isDark ? '#451a03' : '#fef3c7'} />
        <StatCard label="Resolved" value={stats.resolved} icon={<CheckCircle2 size={22} color="#10b981" />} color={isDark ? '#022c22' : '#d1fae5'} />
      </div>

      {/* Filters */}
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 24 }} className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]" style={{ background: isDark ? '#0a0a0f' : '#f1f5f9', borderRadius: 10, padding: '8px 12px' }}>
          <Search size={16} style={{ color: muted }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by ID, name, email, description..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: text, fontSize: 13, flex: 1 }}
          />
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: 12, color: muted }}>
          <Filter size={14} />
          Filters:
        </div>
        <select
          value={filters.status || 'all'}
          onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
          style={{ background: isDark ? '#0a0a0f' : '#f1f5f9', border: `1px solid ${border}`, borderRadius: 8, padding: '6px 10px', color: text, fontSize: 12 }}
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={filters.severity || 'all'}
          onChange={e => setFilters(p => ({ ...p, severity: e.target.value }))}
          style={{ background: isDark ? '#0a0a0f' : '#f1f5f9', border: `1px solid ${border}`, borderRadius: 8, padding: '6px 10px', color: text, fontSize: 12 }}
        >
          <option value="all">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={filters.date_from || ''}
          onChange={e => setFilters(p => ({ ...p, date_from: e.target.value }))}
          style={{ background: isDark ? '#0a0a0f' : '#f1f5f9', border: `1px solid ${border}`, borderRadius: 8, padding: '6px 10px', color: text, fontSize: 12 }}
          title="From date"
        />
        <input
          type="date"
          value={filters.date_to || ''}
          onChange={e => setFilters(p => ({ ...p, date_to: e.target.value }))}
          style={{ background: isDark ? '#0a0a0f' : '#f1f5f9', border: `1px solid ${border}`, borderRadius: 8, padding: '6px 10px', color: text, fontSize: 12 }}
          title="To date"
        />
      </div>

      {/* Table */}
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div style={{ width: 32, height: 32, border: `3px solid ${border}`, borderTopColor: '#f59e0b', borderRadius: '50%' }} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: muted }}>
            <Flag size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No issues found</p>
            <p style={{ fontSize: 13 }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <SortHeader label="ID" field="issue_id" />
                  <SortHeader label="Reporter" field="reporter_name" />
                  <SortHeader label="Role" field="reporter_role" />
                  <SortHeader label="Category" field="category" />
                  <SortHeader label="Severity" field="severity" />
                  <SortHeader label="Description" field="description" />
                  <SortHeader label="Status" field="status" />
                  <SortHeader label="Date" field="created_at" />
                  <th style={{ color: muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '12px 16px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(issue => (
                  <>
                    <tr
                      key={issue.id}
                      onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                      style={{ borderBottom: `1px solid ${border}`, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#16162a' : '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#818cf8' }}>
                        {issue.issue_id}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{issue.reporter_name}</div>
                        <div style={{ fontSize: 11, color: muted }}>{issue.reporter_email}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, textTransform: 'capitalize', color: muted, fontWeight: 500 }}>
                        {issue.reporter_role}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: text }}>
                        {categoryLabels[issue.category] || issue.category}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${severityColors[issue.severity] || ''}`}>
                          {issue.severity.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: muted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {issue.description}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusColors[issue.status] || ''}`}>
                          {issue.status === 'in_progress' ? 'IN PROGRESS' : issue.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: muted, whiteSpace: 'nowrap' }}>
                        {new Date(issue.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === issue.id ? null : issue.id); }}
                            style={{ padding: 6, borderRadius: 8, background: isDark ? '#1e1e2e' : '#f1f5f9' }}
                            title="View Details"
                          >
                            <Eye size={14} style={{ color: '#818cf8' }} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(issue.id); }}
                            disabled={deletingId === issue.id}
                            style={{ padding: 6, borderRadius: 8, background: isDark ? '#1e1e2e' : '#f1f5f9', opacity: deletingId === issue.id ? 0.5 : 1 }}
                            title="Delete"
                          >
                            <Trash2 size={14} style={{ color: '#ef4444' }} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Row */}
                    {expandedId === issue.id && (
                      <tr key={`${issue.id}-detail`} style={{ background: isDark ? '#0d0d18' : '#f1f5f9' }}>
                        <td colSpan={9} style={{ padding: '20px 24px' }}>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Full Description */}
                            <div>
                              <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: muted, marginBottom: 8, letterSpacing: '0.05em' }}>Full Description</h4>
                              <div style={{ background: card, borderRadius: 12, padding: 16, border: `1px solid ${border}`, fontSize: 13, color: text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                {issue.description}
                              </div>
                              {issue.page_name && (
                                <div style={{ marginTop: 12 }}>
                                  <span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Page: </span>
                                  <span style={{ fontSize: 12, color: text }}>{issue.page_name}</span>
                                </div>
                              )}
                            </div>

                            {/* Device Info + Status Change */}
                            <div>
                              <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: muted, marginBottom: 8, letterSpacing: '0.05em' }}>Environment</h4>
                              <div style={{ background: card, borderRadius: 12, padding: 16, border: `1px solid ${border}`, fontSize: 12 }} className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Globe size={14} style={{ color: '#818cf8' }} />
                                  <span style={{ color: muted, fontWeight: 600, width: 60 }}>URL:</span>
                                  <span style={{ color: text, wordBreak: 'break-all' }}>{issue.page_url || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Monitor size={14} style={{ color: '#818cf8' }} />
                                  <span style={{ color: muted, fontWeight: 600, width: 60 }}>Browser:</span>
                                  <span style={{ color: text, wordBreak: 'break-all', fontSize: 11 }}>{issue.browser_info || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Smartphone size={14} style={{ color: '#818cf8' }} />
                                  <span style={{ color: muted, fontWeight: 600, width: 60 }}>OS:</span>
                                  <span style={{ color: text }}>{issue.os_info || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Monitor size={14} style={{ color: '#818cf8' }} />
                                  <span style={{ color: muted, fontWeight: 600, width: 60 }}>Screen:</span>
                                  <span style={{ color: text }}>{issue.device_info || 'N/A'}</span>
                                </div>
                              </div>

                              {/* Status Change */}
                              <div style={{ marginTop: 16 }}>
                                <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: muted, marginBottom: 8, letterSpacing: '0.05em' }}>Update Status</h4>
                                <div className="flex items-center gap-2">
                                  <select
                                    defaultValue={issue.status}
                                    onChange={e => handleStatusChange(issue.id, e.target.value)}
                                    disabled={updatingId === issue.id}
                                    style={{ background: isDark ? '#0a0a0f' : '#ffffff', border: `1px solid ${border}`, borderRadius: 10, padding: '8px 14px', color: text, fontSize: 13, fontWeight: 600 }}
                                  >
                                    <option value="open">Open</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="resolved">Resolved</option>
                                  </select>
                                  {updatingId === issue.id && (
                                    <div style={{ width: 16, height: 16, border: `2px solid ${border}`, borderTopColor: '#f59e0b', borderRadius: '50%' }} className="animate-spin" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
