import { useState } from 'react';
import { provisionTenant } from '../../lib/superAdminApi';
import { X, Building2, Mail, Key, Tag, Users, Loader2, CheckCircle2 } from 'lucide-react';

export default function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [plan, setPlan] = useState('free');
  const [maxUsers, setMaxUsers] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const generateSlug = (n: string) => {
    return n.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  };

  const handleNameChange = (v: string) => {
    setName(v);
    setSlug(generateSlug(v));
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setAdminPassword(pwd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await provisionTenant({ name, slug, adminEmail, adminPassword, plan, maxUsers });
      setSuccess(true);
      setTimeout(() => onCreated(), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to provision tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#12121a] border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all">
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create New Tenant</h2>
              <p className="text-xs text-white/30">Provision a new college institution</p>
            </div>
          </div>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Tenant Created!</h3>
            <p className="text-white/40 text-sm">The institution has been provisioned successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
            )}

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">
                <Building2 className="w-3 h-3 inline mr-1" /> College Name
              </label>
              <input value={name} onChange={e => handleNameChange(e.target.value)} required
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm"
                placeholder="Maharaja Institute of Technology, Mysore" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">
                <Tag className="w-3 h-3 inline mr-1" /> Subdomain Slug
              </label>
              <input value={slug} onChange={e => setSlug(e.target.value)} required
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-violet-300 font-mono placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm"
                placeholder="mit-mysore" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">
                <Mail className="w-3 h-3 inline mr-1" /> Admin Email
              </label>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm"
                placeholder="admin@college.edu" />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">
                <Key className="w-3 h-3 inline mr-1" /> Admin Password
              </label>
              <div className="flex gap-2">
                <input value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required
                  className="flex-1 px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white font-mono placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm"
                  placeholder="Min 6 characters" />
                <button type="button" onClick={generatePassword}
                  className="px-4 py-3 bg-violet-600/20 border border-violet-500/30 rounded-xl text-violet-300 text-xs font-bold hover:bg-violet-600/30 transition-all whitespace-nowrap">
                  Generate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">Plan Tier</label>
                <select value={plan} onChange={e => setPlan(e.target.value)}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm appearance-none">
                  <option value="free" className="bg-[#12121a]">Free</option>
                  <option value="standard" className="bg-[#12121a]">Standard</option>
                  <option value="premium" className="bg-[#12121a]">Premium</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-1.5">
                  <Users className="w-3 h-3 inline mr-1" /> Max Users
                </label>
                <input type="number" value={maxUsers} onChange={e => setMaxUsers(Number(e.target.value))} min={1}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white/50 font-medium hover:bg-white/[0.08] transition-all text-sm">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-[0_8px_24px_-4px_rgba(124,58,237,0.5)] active:scale-[0.98] transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                {loading ? 'Provisioning...' : 'Create Tenant'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
