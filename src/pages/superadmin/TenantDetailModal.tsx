import { useState, useEffect } from 'react';
import { type Tenant, getTenantUsers, toggleTenantStatus, getTenantClearanceCount } from '../../lib/superAdminApi';
import { X, Building2, Users, FileCheck, Power, Shield, Clock, Mail, Tag, Crown, ChevronDown, ChevronRight } from 'lucide-react';

type TenantUser = { id: string; full_name: string; role: string; roll_number: string | null; section: string | null; created_at: string };

export default function TenantDetailModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [clearanceCount, setClearanceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState(tenant.status);
  const [showUsers, setShowUsers] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [u, c] = await Promise.all([getTenantUsers(tenant.id), getTenantClearanceCount(tenant.id)]);
        setUsers(u as TenantUser[]);
        setClearanceCount(c);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch();
  }, [tenant.id]);

  const handleToggle = async () => {
    const newStatus = status === 'active' ? 'suspended' : 'active';
    setToggling(true);
    try {
      await toggleTenantStatus(tenant.id, newStatus);
      setStatus(newStatus);
    } catch (err) { console.error(err); }
    finally { setToggling(false); }
  };

  const roleCounts: Record<string, number> = {};
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#12121a] border border-white/[0.08] rounded-2xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all z-10">
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white truncate">{tenant.name}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <code className="text-xs bg-white/[0.04] px-2 py-0.5 rounded-lg text-violet-300 font-mono">{tenant.slug}</code>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${
                  status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {status}
                </span>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase ${
                  tenant.plan === 'premium' ? 'bg-amber-500/10 text-amber-400' :
                  tenant.plan === 'standard' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-white/[0.04] text-white/40'
                }`}>{tenant.plan}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCard icon={<Users className="w-4 h-4" />} label="Users" value={loading ? '...' : String(users.length)} color="blue" />
            <InfoCard icon={<FileCheck className="w-4 h-4" />} label="Clearances" value={loading ? '...' : String(clearanceCount)} color="emerald" />
            <InfoCard icon={<Crown className="w-4 h-4" />} label="Max Users" value={String(tenant.max_users)} color="amber" />
            <InfoCard icon={<Clock className="w-4 h-4" />} label="Created" value={new Date(tenant.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} color="violet" />
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailRow icon={<Mail className="w-4 h-4 text-blue-400" />} label="Admin Email" value={tenant.admin_email} />
            <DetailRow icon={<Tag className="w-4 h-4 text-violet-400" />} label="Tenant ID" value={tenant.id.slice(0, 8) + '...'} />
          </div>

          {/* Role Breakdown */}
          {!loading && Object.keys(roleCounts).length > 0 && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <p className="text-xs text-white/30 uppercase tracking-wider font-bold mb-3">Role Distribution</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(roleCounts).sort((a,b) => b[1] - a[1]).map(([role, count]) => (
                  <span key={role} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs">
                    <Shield className="w-3 h-3 text-violet-400" />
                    <span className="text-white/60 capitalize">{role}</span>
                    <span className="text-white font-bold">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Users List (collapsible) */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
            <button onClick={() => setShowUsers(!showUsers)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                User List ({users.length})
              </span>
              {showUsers ? <ChevronDown className="w-4 h-4 text-white/30" /> : <ChevronRight className="w-4 h-4 text-white/30" />}
            </button>
            {showUsers && (
              <div className="border-t border-white/[0.04] max-h-64 overflow-y-auto">
                {users.length === 0 ? (
                  <p className="p-4 text-center text-white/20 text-sm">No users found</p>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-white/20 uppercase tracking-wider border-b border-white/[0.04]">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Role</th>
                        <th className="px-4 py-2">USN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {users.slice(0, 50).map(u => (
                        <tr key={u.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-xs text-white/70">{u.full_name}</td>
                          <td className="px-4 py-2 text-xs text-violet-300 capitalize">{u.role}</td>
                          <td className="px-4 py-2 text-xs text-white/30 font-mono">{u.roll_number || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={handleToggle} disabled={toggling}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                status === 'active'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
              } disabled:opacity-50`}>
              <Power className="w-4 h-4" />
              {toggling ? 'Updating...' : status === 'active' ? 'Suspend Tenant' : 'Reactivate Tenant'}
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white/50 font-medium hover:bg-white/[0.08] transition-all text-sm">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-600 to-cyan-600',
    emerald: 'from-emerald-600 to-teal-600',
    amber: 'from-amber-500 to-orange-500',
    violet: 'from-violet-600 to-purple-600',
  };
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 text-center">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colorMap[color] || colorMap.blue} flex items-center justify-center mx-auto mb-2 shadow-sm`}>
        {icon}
      </div>
      <p className="text-lg font-extrabold text-white">{value}</p>
      <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{label}</p>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold">{label}</p>
        <p className="text-sm text-white/70 font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
