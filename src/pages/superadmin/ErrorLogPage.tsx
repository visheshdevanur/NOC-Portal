import { useState, useEffect, useCallback } from 'react';
import {
  getPlatformErrors, getErrorStats,
  type PlatformError, type PlatformErrorSeverity, type ErrorFilters,
  getAllTenants, type Tenant,
} from '../../lib/superAdminApi';
import {
  AlertTriangle, AlertCircle, Info, RefreshCw, Search,
  Filter, Clock, Shield, ChevronDown, X,
} from 'lucide-react';

const s = (o: Record<string, any>) => o as React.CSSProperties;

const SEVERITY_CONFIG: Record<PlatformErrorSeverity, { color: string; bg: string; border: string; icon: typeof AlertTriangle; label: string }> = {
  CRITICAL: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', icon: AlertTriangle, label: '🔴 CRITICAL' },
  WARNING:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)',  icon: AlertCircle, label: '🟡 WARNING' },
  INFO:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)',  icon: Info, label: '🔵 INFO' },
};

const DASHBOARDS = [
  'Fine Category Management','Student Management','Subject Management',
  'Section & Teacher Assignment','Attendance Management','Department Management',
  'Student Promotion','Tenant Management','User Management',
];
const ROLES = ['clerk','hod','fyc','teacher','admin','staff','accounts'];

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ErrorCard({ err }: { err: PlatformError }) {
  const cfg = SEVERITY_CONFIG[err.severity] || SEVERITY_CONFIG.CRITICAL;
  const Icon = cfg.icon;
  return (
    <div style={s({ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 10 })}>
      {/* Top row */}
      <div style={s({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 })}>
        <div style={s({ display: 'flex', alignItems: 'center', gap: 8 })}>
          <Icon size={14} color={cfg.color} />
          <span style={s({ fontSize: 12, fontWeight: 800, color: cfg.color, letterSpacing: '0.06em' })}>{err.severity}</span>
        </div>
        <span style={s({ fontSize: 11, color: 'var(--sa-text-muted)', display: 'flex', alignItems: 'center', gap: 4 })}>
          <Clock size={11} />{fmt(err.created_at)}
        </span>
      </div>
      {/* Table-style details */}
      <div style={s({ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 12 })}>
        {[
          ['Tenant',       err.tenant_name ? `${err.tenant_name} (${err.tenant_id?.slice(0,8)}…)` : '—'],
          ['Dashboard',    err.dashboard_name],
          ['Path',         err.nav_path || '—'],
          ['Error Code',   err.error_code],
          ['Error Detail', err.error_detail],
          ['Triggered By', err.triggered_by_role && err.triggered_by_email
            ? `${err.triggered_by_role.toUpperCase()} — ${err.triggered_by_email}`
            : (err.triggered_by_role || err.triggered_by_email || '—')],
        ].map(([k, v]) => (
          <div key={k} style={s({ display: 'contents' })}>
            <span style={s({ color: 'var(--sa-text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: 2, whiteSpace: 'nowrap' })}>{k}</span>
            <span style={s({ color: k === 'Error Code' ? cfg.color : k === 'Error Detail' ? 'var(--sa-text)' : 'var(--sa-text-secondary)', fontFamily: k === 'Error Code' ? 'monospace' : 'inherit', fontWeight: k === 'Error Code' ? 700 : 400, wordBreak: 'break-word' })}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ErrorLogPage() {
  const [errors, setErrors]   = useState<PlatformError[]>([]);
  const [stats, setStats]     = useState<{ critical: number; warning: number; info: number; total: number }>({ critical: 0, warning: 0, info: 0, total: 0 });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [fTenant,    setFTenant]    = useState('');
  const [fDashboard, setFDashboard] = useState('');
  const [fSeverity,  setFSeverity]  = useState('');
  const [fRole,      setFRole]      = useState('');
  const [fCode,      setFCode]      = useState('');
  const [fDateFrom,  setFDateFrom]  = useState('');
  const [fDateTo,    setFDateTo]    = useState('');

  const activeFilterCount = [fTenant,fDashboard,fSeverity,fRole,fCode,fDateFrom,fDateTo].filter(Boolean).length;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const filters: ErrorFilters = {};
      if (fTenant)    filters.tenant_id      = fTenant;
      if (fDashboard) filters.dashboard_name = fDashboard;
      if (fSeverity)  filters.severity       = fSeverity as PlatformErrorSeverity;
      if (fRole)      filters.role           = fRole;
      if (fCode)      filters.error_code     = fCode;
      if (fDateFrom)  filters.date_from      = new Date(fDateFrom).toISOString();
      if (fDateTo)    filters.date_to        = new Date(fDateTo + 'T23:59:59').toISOString();

      const [errs, st, tn] = await Promise.all([
        getPlatformErrors(filters),
        getErrorStats(),
        tenants.length ? Promise.resolve(tenants) : getAllTenants(),
      ]);
      setErrors(errs);
      setStats(st);
      if (!tenants.length) setTenants(tn);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [fTenant, fDashboard, fSeverity, fRole, fCode, fDateFrom, fDateTo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(fetchAll, 30_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const clearFilters = () => {
    setFTenant(''); setFDashboard(''); setFSeverity('');
    setFRole(''); setFCode(''); setFDateFrom(''); setFDateTo('');
  };

  const inp = s({ padding: '8px 12px', background: 'var(--sa-bg-input)', border: '1px solid var(--sa-border)', borderRadius: 8, color: 'var(--sa-text)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' });
  const sel = { ...inp, appearance: 'none' as any };

  return (
    <div style={s({ padding: '28px 0' })}>
      {/* Header */}
      <div style={s({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 })}>
        <div>
          <h2 style={s({ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--sa-text)', letterSpacing: '-0.02em' })}>Platform Error Logs</h2>
          <p style={s({ fontSize: 13, color: 'var(--sa-text-muted)', margin: '4px 0 0' })}>
            Cross-tenant error monitoring — {stats.total} total entries
          </p>
        </div>
        <button onClick={fetchAll} style={s({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 12, fontWeight: 500 })}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Severity stat chips */}
      <div style={s({ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' })}>
        {(['CRITICAL','WARNING','INFO'] as PlatformErrorSeverity[]).map(sev => {
          const cfg = SEVERITY_CONFIG[sev];
          const count = sev === 'CRITICAL' ? stats.critical : sev === 'WARNING' ? stats.warning : stats.info;
          return (
            <button key={sev} onClick={() => setFSeverity(fSeverity === sev ? '' : sev)}
              style={s({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${fSeverity === sev ? cfg.color : 'var(--sa-border)'}`, background: fSeverity === sev ? cfg.bg : 'var(--sa-bg-card)', cursor: 'pointer', transition: 'all 0.2s' })}>
              <cfg.icon size={13} color={cfg.color} />
              <span style={s({ fontSize: 12, fontWeight: 700, color: cfg.color })}>{sev}</span>
              <span style={s({ fontSize: 14, fontWeight: 800, color: 'var(--sa-text)' })}>{loading ? '—' : count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div style={s({ background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' })}>
        <div style={s({ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: showFilters ? '1px solid var(--sa-border)' : 'none' })}>
          <Search size={14} color="var(--sa-text-muted)" />
          <input value={fCode} onChange={e => setFCode(e.target.value)} placeholder="Search error code…"
            style={s({ ...inp, border: 'none', background: 'transparent', flex: 1, padding: '0', fontSize: 13 })} />
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={s({ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--sa-text-muted)', background: 'none', border: 'none', cursor: 'pointer' })}>
              <X size={12} /> Clear all
            </button>
          )}
          <button onClick={() => setShowFilters(p => !p)}
            style={s({ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: activeFilterCount ? '#7c3aed18' : 'var(--sa-bg-elevated)', border: `1px solid ${activeFilterCount ? '#7c3aed40' : 'var(--sa-border)'}`, borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: activeFilterCount ? '#7c3aed' : 'var(--sa-text-secondary)' })}>
            <Filter size={12} /> Filters {activeFilterCount > 0 && `(${activeFilterCount})`} <ChevronDown size={12} style={s({ transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' })} />
          </button>
        </div>

        {showFilters && (
          <div style={s({ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 })}>
            <div>
              <div style={s({ fontSize: 10, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 })}>Tenant</div>
              <select value={fTenant} onChange={e => setFTenant(e.target.value)} style={sel}>
                <option value="">All tenants</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <div style={s({ fontSize: 10, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 })}>Dashboard</div>
              <select value={fDashboard} onChange={e => setFDashboard(e.target.value)} style={sel}>
                <option value="">All dashboards</option>
                {DASHBOARDS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <div style={s({ fontSize: 10, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 })}>Role</div>
              <select value={fRole} onChange={e => setFRole(e.target.value)} style={sel}>
                <option value="">All roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <div style={s({ fontSize: 10, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 })}>From</div>
              <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <div style={s({ fontSize: 10, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 })}>To</div>
              <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)} style={inp} />
            </div>
          </div>
        )}
      </div>

      {/* Error list */}
      {loading ? (
        <div style={s({ textAlign: 'center', padding: '60px 0', color: 'var(--sa-text-muted)', fontSize: 13 })}>Loading error logs…</div>
      ) : errors.length === 0 ? (
        <div style={s({ textAlign: 'center', padding: '80px 0', background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14 })}>
          <Shield size={40} style={s({ color: 'var(--sa-text-muted)', opacity: 0.3, marginBottom: 12, display: 'inline-block' })} />
          <p style={s({ color: 'var(--sa-text-muted)', fontSize: 14, margin: 0, fontWeight: 500 })}>No errors found</p>
          <p style={s({ color: 'var(--sa-text-muted)', fontSize: 12, margin: '4px 0 0', opacity: 0.7 })}>
            {activeFilterCount > 0 ? 'Try adjusting your filters' : 'The platform is running cleanly'}
          </p>
        </div>
      ) : (
        <div>
          <div style={s({ fontSize: 11, color: 'var(--sa-text-muted)', marginBottom: 10, fontWeight: 500 })}>
            Showing {errors.length} error{errors.length !== 1 ? 's' : ''}
            {activeFilterCount > 0 ? ' (filtered)' : ''}
          </div>
          {errors.map(err => <ErrorCard key={err.id} err={err} />)}
        </div>
      )}
    </div>
  );
}
