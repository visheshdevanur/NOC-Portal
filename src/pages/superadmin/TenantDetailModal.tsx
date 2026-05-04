import { useState, useEffect } from 'react';
import { type Tenant, getTenantUsers, toggleTenantStatus, getTenantClearanceCount } from '../../lib/superAdminApi';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { X, Building2, Users, FileCheck, Power, Shield, Clock, Mail, Tag, Crown, ChevronLeft, Save, Pencil, Loader2 } from 'lucide-react';

type TenantUser = { id: string; full_name: string; role: string; roll_number: string | null; section: string | null; created_at: string };

type ViewMode = 'detail' | 'edit' | 'role-users';

export default function TenantDetailModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [clearanceCount, setClearanceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState(tenant.status);
  const [view, setView] = useState<ViewMode>('detail');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState(tenant.name);
  const [editPlan, setEditPlan] = useState(tenant.plan);
  const [editMaxUsers, setEditMaxUsers] = useState(tenant.max_users);
  const [editAdminEmail, setEditAdminEmail] = useState(tenant.admin_email);
  const [editSlug, setEditSlug] = useState(tenant.slug);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

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

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const { error } = await supabaseAdmin
        .from('tenants')
        .update({
          name: editName,
          slug: editSlug,
          plan: editPlan,
          max_users: editMaxUsers,
          admin_email: editAdminEmail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenant.id);
      if (error) throw error;
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setView('detail'); }, 1200);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const roleCounts: Record<string, number> = {};
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  const roleUsers = selectedRole ? users.filter(u => u.role === selectedRole) : [];

  // ---- ROLE USERS VIEW ----
  if (view === 'role-users' && selectedRole) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#12121a] border border-white/[0.08] rounded-2xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all z-10">
            <X className="w-4 h-4" />
          </button>

          <div className="p-6 border-b border-white/[0.06]">
            <button onClick={() => { setView('detail'); setSelectedRole(null); }}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-3">
              <ChevronLeft className="w-4 h-4" /> Back to Tenant
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white capitalize">{selectedRole}s</h2>
                <p className="text-xs text-white/30">{roleUsers.length} users · {tenant.name}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {roleUsers.length === 0 ? (
              <p className="text-center text-white/20 text-sm py-8">No users with this role</p>
            ) : (
              <div className="space-y-2">
                {roleUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600/20 to-blue-600/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-violet-300">{u.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{u.full_name}</p>
                        {u.roll_number && <p className="text-[10px] text-white/30 font-mono">{u.roll_number}</p>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {u.section && <span className="text-xs bg-white/[0.04] px-2 py-0.5 rounded-lg text-white/40 mr-2">Sec {u.section}</span>}
                      <span className="text-[10px] text-white/20">{new Date(u.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- EDIT VIEW ----
  if (view === 'edit') {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#12121a] border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all z-10">
            <X className="w-4 h-4" />
          </button>

          <div className="p-6 border-b border-white/[0.06]">
            <button onClick={() => setView('detail')}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-3">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Pencil className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Edit Tenant</h2>
                <p className="text-xs text-white/30">Update institution details</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {saveError && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{saveError}</div>}
            {saveSuccess && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm font-medium">✓ Saved successfully</div>}

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">College Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">Slug</label>
              <input value={editSlug} onChange={e => setEditSlug(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-violet-300 font-mono placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">Admin Email</label>
              <input type="email" value={editAdminEmail} onChange={e => setEditAdminEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">Plan</label>
                <select value={editPlan} onChange={e => setEditPlan(e.target.value)}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm appearance-none">
                  <option value="free" className="bg-[#12121a]">Free</option>
                  <option value="standard" className="bg-[#12121a]">Standard</option>
                  <option value="premium" className="bg-[#12121a]">Premium</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">Max Users</label>
                <input type="number" value={editMaxUsers} onChange={e => setEditMaxUsers(Number(e.target.value))} min={1}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setView('detail')}
                className="flex-1 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white/50 font-medium hover:bg-white/[0.08] transition-all text-sm">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg hover:shadow-[0_8px_24px_-4px_rgba(245,158,11,0.4)] active:scale-[0.98] transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- DETAIL VIEW (default) ----
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
              <h2 className="text-xl font-bold text-white truncate">{editName}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <code className="text-xs bg-white/[0.04] px-2 py-0.5 rounded-lg text-violet-300 font-mono">{editSlug}</code>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${
                  status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {status}
                </span>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase ${
                  editPlan === 'premium' ? 'bg-amber-500/10 text-amber-400' :
                  editPlan === 'standard' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-white/[0.04] text-white/40'
                }`}>{editPlan}</span>
              </div>
            </div>
            <button onClick={() => setView('edit')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-bold flex-shrink-0">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCard icon={<Users className="w-4 h-4" />} label="Users" value={loading ? '...' : String(users.length)} color="blue" />
            <InfoCard icon={<FileCheck className="w-4 h-4" />} label="Clearances" value={loading ? '...' : String(clearanceCount)} color="emerald" />
            <InfoCard icon={<Crown className="w-4 h-4" />} label="Max Users" value={String(editMaxUsers)} color="amber" />
            <InfoCard icon={<Clock className="w-4 h-4" />} label="Created" value={new Date(tenant.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} color="violet" />
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailRow icon={<Mail className="w-4 h-4 text-blue-400" />} label="Admin Email" value={editAdminEmail} />
            <DetailRow icon={<Tag className="w-4 h-4 text-violet-400" />} label="Tenant ID" value={tenant.id.slice(0, 8) + '...'} />
          </div>

          {/* Role Distribution — clickable badges */}
          {!loading && Object.keys(roleCounts).length > 0 && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <p className="text-xs text-white/30 uppercase tracking-wider font-bold mb-3">Role Distribution — click to view users</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(roleCounts).sort((a,b) => b[1] - a[1]).map(([role, count]) => (
                  <button
                    key={role}
                    onClick={() => { setSelectedRole(role); setView('role-users'); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-300 transition-all cursor-pointer group"
                  >
                    <Shield className="w-3 h-3 text-violet-400 group-hover:text-violet-300" />
                    <span className="text-white/60 capitalize group-hover:text-violet-200">{role}</span>
                    <span className="text-white font-bold group-hover:text-violet-100">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
