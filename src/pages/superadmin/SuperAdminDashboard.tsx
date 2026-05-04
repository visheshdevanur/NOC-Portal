import { useState, useEffect } from 'react';
import { getPlatformStats, getAllTenants, type Tenant, type TenantStats, getTenantUserCount } from '../../lib/superAdminApi';
import { logoutSuperAdmin } from '../../lib/superAdminAuth';
import { useSATheme } from './SuperAdminApp';
import { Shield, Building2, Users, FileCheck, Plus, Eye, LogOut, Search, ChevronRight, Zap, Sun, Moon } from 'lucide-react';
import CreateTenantModal from './CreateTenantModal';
import TenantDetailModal from './TenantDetailModal';
import './superadmin.css';

const s = (obj: Record<string, any>) => obj as React.CSSProperties;

export default function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { theme, toggle } = useSATheme();
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [tenants, setTenants] = useState<(Tenant & { userCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [st, t] = await Promise.all([getPlatformStats(), getAllTenants()]);
      setStats(st);
      const enriched = await Promise.all(t.map(async (tn) => ({ ...tn, userCount: await getTenantUserCount(tn.id).catch(() => 0) })));
      setTenants(enriched);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleLogout = () => { logoutSuperAdmin(); onLogout(); };
  const filtered = tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()));

  const statCards = [
    { label: 'Total Tenants', value: stats?.totalTenants || 0, icon: Building2, color: '#7c3aed' },
    { label: 'Active', value: stats?.activeTenants || 0, icon: Zap, color: '#059669' },
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: '#3b82f6' },
    { label: 'Clearances', value: stats?.totalClearances || 0, icon: FileCheck, color: '#f59e0b' },
  ];

  return (
    <div style={s({ background: 'var(--sa-bg)', minHeight: '100vh', color: 'var(--sa-text)', fontFamily: 'Inter, Manrope, system-ui, sans-serif' })}>
      {/* Nav */}
      <nav style={s({ borderBottom: '1px solid var(--sa-border)', background: 'var(--sa-bg-card)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 })}>
        <div style={s({ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 })}>
          <div style={s({ display: 'flex', alignItems: 'center', gap: 10 })}>
            <div style={s({ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
              <Shield size={17} color="white" />
            </div>
            <div>
              <div style={s({ fontWeight: 700, fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.2 })}>NOC Developer Portal</div>
              <div style={s({ fontSize: 10, color: 'var(--sa-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' })}>Super Admin</div>
            </div>
          </div>
          <div style={s({ display: 'flex', alignItems: 'center', gap: 8 })}>
            <button onClick={toggle} style={s({ width: 36, height: 36, borderRadius: 10, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sa-text-secondary)', transition: 'all 0.2s' })}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button onClick={handleLogout} style={s({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 13, fontWeight: 500, transition: 'all 0.2s' })}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div style={s({ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' })}>
        {/* Header */}
        <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 16 })}>
          <div>
            <h1 style={s({ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--sa-text)' })}>Platform Overview</h1>
            <p style={s({ fontSize: 14, color: 'var(--sa-text-muted)', margin: '4px 0 0', fontWeight: 400 })}>Manage tenants and monitor the platform</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} style={s({ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: '0 4px 12px -2px rgba(124,58,237,0.35)', transition: 'all 0.2s' })}>
            <Plus size={15} /> New Tenant
          </button>
        </div>

        {/* Stats */}
        <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 })}>
          {statCards.map(card => (
            <div key={card.label} style={s({ background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: '20px 18px', boxShadow: 'var(--sa-shadow)', transition: 'all 0.2s' })}>
              <div style={s({ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 })}>
                <div style={s({ width: 32, height: 32, borderRadius: 8, background: card.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                  <card.icon size={16} color={card.color} />
                </div>
                <span style={s({ fontSize: 12, fontWeight: 600, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' })}>{card.label}</span>
              </div>
              <p style={s({ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--sa-text)', letterSpacing: '-0.02em' })}>{loading ? '—' : card.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Tenants */}
        <div style={s({ background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--sa-shadow)' })}>
          <div style={s({ padding: '16px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' })}>
            <h2 style={s({ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--sa-text)' })}>Registered Tenants</h2>
            <div style={s({ position: 'relative' })}>
              <Search size={14} style={s({ position: 'absolute', left: 10, top: 9, color: 'var(--sa-text-muted)' })} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                style={s({ paddingLeft: 30, paddingRight: 14, paddingTop: 8, paddingBottom: 8, background: 'var(--sa-bg-input)', border: '1px solid var(--sa-border)', borderRadius: 8, fontSize: 13, color: 'var(--sa-text)', outline: 'none', width: 200, transition: 'border-color 0.2s', boxSizing: 'border-box' })} />
            </div>
          </div>

          {loading ? (
            <div style={s({ padding: 40, textAlign: 'center', color: 'var(--sa-text-muted)', fontSize: 13 })}>Loading tenants...</div>
          ) : filtered.length === 0 ? (
            <div style={s({ padding: 60, textAlign: 'center' })}>
              <Building2 size={36} style={s({ color: 'var(--sa-text-muted)', opacity: 0.3, marginBottom: 8, display: 'inline-block' })} />
              <p style={s({ color: 'var(--sa-text-muted)', fontSize: 13, margin: 0 })}>No tenants found</p>
            </div>
          ) : (
            <div style={s({ overflowX: 'auto' })}>
              <table style={s({ width: '100%', borderCollapse: 'collapse' })}>
                <thead>
                  <tr>
                    {['Institution', 'Slug', 'Plan', 'Users', 'Status', 'Created', ''].map(h => (
                      <th key={h} style={s({ padding: '10px 18px', fontSize: 11, fontWeight: 600, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === '' ? 'right' : 'left', borderBottom: '1px solid var(--sa-border)' })}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} style={s({ borderBottom: '1px solid var(--sa-border)', transition: 'background 0.15s', cursor: 'pointer' })} onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} onClick={() => setSelectedTenant(t)}>
                      <td style={s({ padding: '14px 18px' })}>
                        <div style={s({ fontWeight: 600, fontSize: 13, color: 'var(--sa-text)' })}>{t.name}</div>
                        <div style={s({ fontSize: 11, color: 'var(--sa-text-muted)', marginTop: 2 })}>{t.admin_email}</div>
                      </td>
                      <td style={s({ padding: '14px 18px' })}>
                        <code style={s({ fontSize: 12, background: 'var(--sa-bg-elevated)', padding: '3px 8px', borderRadius: 6, color: '#7c3aed', fontFamily: 'monospace' })}>{t.slug}</code>
                      </td>
                      <td style={s({ padding: '14px 18px' })}>
                        <span style={s({ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: t.plan === 'premium' ? '#f59e0b18' : t.plan === 'standard' ? '#3b82f618' : 'var(--sa-bg-elevated)', color: t.plan === 'premium' ? '#f59e0b' : t.plan === 'standard' ? '#3b82f6' : 'var(--sa-text-muted)' })}>{t.plan}</span>
                      </td>
                      <td style={s({ padding: '14px 18px', fontSize: 13, fontWeight: 600, color: 'var(--sa-text-secondary)' })}>{t.userCount ?? '—'}</td>
                      <td style={s({ padding: '14px 18px' })}>
                        <span style={s({ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: t.status === 'active' ? '#05966918' : '#dc262618', color: t.status === 'active' ? 'var(--sa-success)' : 'var(--sa-danger)' })}>
                          <span style={s({ width: 5, height: 5, borderRadius: '50%', background: t.status === 'active' ? 'var(--sa-success)' : 'var(--sa-danger)' })} />
                          {t.status}
                        </span>
                      </td>
                      <td style={s({ padding: '14px 18px', fontSize: 12, color: 'var(--sa-text-muted)' })}>{new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td style={s({ padding: '14px 18px', textAlign: 'right' })}>
                        <button onClick={e => { e.stopPropagation(); setSelectedTenant(t); }} style={s({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 12, fontWeight: 500, transition: 'all 0.2s' })}>
                          <Eye size={13} /> View <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && <CreateTenantModal onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); fetchData(); }} />}
      {selectedTenant && <TenantDetailModal tenant={selectedTenant} onClose={() => { setSelectedTenant(null); fetchData(); }} />}
    </div>
  );
}
