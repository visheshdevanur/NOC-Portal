import { useState, useEffect } from 'react';
import { getPlatformStats, getAllTenants, type Tenant, type TenantStats, getTenantUserCount } from '../../lib/superAdminApi';
import { logoutSuperAdmin } from '../../lib/superAdminAuth';
import { Shield, Building2, Users, FileCheck, Plus, Eye, LogOut, Search, ChevronRight, Zap, TrendingUp } from 'lucide-react';
import CreateTenantModal from './CreateTenantModal';
import TenantDetailModal from './TenantDetailModal';

export default function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [tenants, setTenants] = useState<(Tenant & { userCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([getPlatformStats(), getAllTenants()]);
      setStats(s);
      // Fetch user counts in parallel
      const enriched = await Promise.all(
        t.map(async (tenant) => {
          const userCount = await getTenantUserCount(tenant.id).catch(() => 0);
          return { ...tenant, userCount };
        })
      );
      setTenants(enriched);
    } catch (err) {
      console.error('Failed to fetch platform data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleLogout = () => {
    logoutSuperAdmin();
    onLogout();
  };

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const statCards = [
    { label: 'Total Tenants', value: stats?.totalTenants || 0, icon: Building2, color: 'violet', gradient: 'from-violet-600 to-purple-600' },
    { label: 'Active Tenants', value: stats?.activeTenants || 0, icon: Zap, color: 'emerald', gradient: 'from-emerald-600 to-teal-600' },
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: 'blue', gradient: 'from-blue-600 to-cyan-600' },
    { label: 'Total Clearances', value: stats?.totalClearances || 0, icon: FileCheck, color: 'amber', gradient: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top Nav */}
      <nav className="border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-tight block leading-tight">NOC Developer Portal</span>
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Super Admin</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-white/50 transition-all text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Platform Overview
            </h1>
            <p className="text-white/40 mt-1">Manage all tenants, users, and clearances across the NOC platform.</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl shadow-[0_8px_24px_-4px_rgba(124,58,237,0.4)] hover:shadow-[0_12px_32px_-4px_rgba(124,58,237,0.6)] active:scale-[0.98] transition-all text-sm"
          >
            <Plus className="w-4 h-4" />
            Create New Tenant
          </button>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-white/[0.02] rounded-2xl animate-pulse border border-white/[0.04]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="relative bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 overflow-hidden group hover:border-white/[0.12] transition-all">
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${card.gradient} opacity-[0.06] rounded-full blur-2xl -translate-y-6 translate-x-6 group-hover:opacity-[0.12] transition-opacity`} />
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg mb-3`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl font-extrabold text-white">{card.value.toLocaleString()}</p>
                <p className="text-xs text-white/30 font-semibold uppercase tracking-wider mt-1">{card.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tenants Table */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-400" />
              Registered Tenants
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/20" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tenants..."
                className="pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 w-64 transition-all"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 font-medium">No tenants found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-white/30 uppercase tracking-wider border-b border-white/[0.04]">
                    <th className="px-6 py-3 font-semibold">Institution</th>
                    <th className="px-6 py-3 font-semibold">Slug</th>
                    <th className="px-6 py-3 font-semibold text-center">Plan</th>
                    <th className="px-6 py-3 font-semibold text-center">Users</th>
                    <th className="px-6 py-3 font-semibold text-center">Status</th>
                    <th className="px-6 py-3 font-semibold text-center">Created</th>
                    <th className="px-6 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filtered.map(tenant => (
                    <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white text-sm">{tenant.name}</p>
                        <p className="text-xs text-white/30">{tenant.admin_email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-xs bg-white/[0.04] px-2 py-1 rounded-lg text-violet-300 font-mono">{tenant.slug}</code>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${
                          tenant.plan === 'premium' ? 'bg-amber-500/10 text-amber-400' :
                          tenant.plan === 'standard' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-white/[0.04] text-white/40'
                        }`}>
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-white/60 font-medium">
                        {tenant.userCount ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                          tenant.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-xs text-white/30">
                        {new Date(tenant.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedTenant(tenant)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-violet-500/10 hover:border-violet-500/30 text-white/50 hover:text-violet-300 transition-all text-xs font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                          <ChevronRight className="w-3 h-3" />
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

      {/* Modals */}
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchData(); }}
        />
      )}
      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => { setSelectedTenant(null); fetchData(); }}
        />
      )}
    </div>
  );
}
