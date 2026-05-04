import { useState } from 'react';
import { provisionTenant } from '../../lib/superAdminApi';
import { X, Building2, Mail, Key, Tag, Users, Loader2, CheckCircle2 } from 'lucide-react';

const s = (obj: Record<string, any>) => obj as React.CSSProperties;
const input = s({ width: '100%', padding: '10px 14px', background: 'var(--sa-bg-input)', border: '1px solid var(--sa-border)', borderRadius: 10, color: 'var(--sa-text)', fontSize: 13, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' as const });
const label = s({ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 });

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

  const handleNameChange = (v: string) => { setName(v); setSlug(v.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()); };
  const generatePassword = () => { const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'; let p = ''; for (let i = 0; i < 12; i++) p += c[Math.floor(Math.random() * c.length)]; setAdminPassword(p); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try { await provisionTenant({ name, slug, adminEmail, adminPassword, plan, maxUsers }); setSuccess(true); setTimeout(() => onCreated(), 1200); }
    catch (err: any) { setError(err.message || 'Failed to provision'); }
    finally { setLoading(false); }
  };

  return (
    <div style={s({ position: 'fixed', inset: 0, background: 'var(--sa-modal-overlay)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 })}>
      <div style={s({ background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: 'var(--sa-shadow-lg)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' as const })}>
        <button onClick={onClose} style={s({ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 8, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sa-text-muted)' })}><X size={14} /></button>

        <div style={s({ padding: '20px 24px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 })}>
          <div style={s({ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' })}><Building2 size={18} color="white" /></div>
          <div>
            <h2 style={s({ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--sa-text)' })}>New Tenant</h2>
            <p style={s({ fontSize: 12, color: 'var(--sa-text-muted)', margin: 0 })}>Provision a college institution</p>
          </div>
        </div>

        {success ? (
          <div style={s({ padding: 48, textAlign: 'center' })}>
            <CheckCircle2 size={48} color="var(--sa-success)" style={s({ marginBottom: 12 })} />
            <h3 style={s({ fontSize: 18, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 4px' })}>Tenant Created!</h3>
            <p style={s({ fontSize: 13, color: 'var(--sa-text-muted)', margin: 0 })}>Institution provisioned successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={s({ padding: 24 })}>
            {error && <div style={s({ marginBottom: 16, padding: '8px 12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.12)', borderRadius: 8, color: 'var(--sa-danger)', fontSize: 12 })}>{error}</div>}

            <div style={s({ marginBottom: 16 })}>
              <div style={label}><Building2 size={11} /> College Name</div>
              <input value={name} onChange={e => handleNameChange(e.target.value)} required placeholder="Maharaja Institute of Technology" style={input} />
            </div>
            <div style={s({ marginBottom: 16 })}>
              <div style={label}><Tag size={11} /> Slug</div>
              <input value={slug} onChange={e => setSlug(e.target.value)} required placeholder="mit-mysore" style={{ ...input, fontFamily: 'monospace', color: '#7c3aed' }} />
            </div>
            <div style={s({ marginBottom: 16 })}>
              <div style={label}><Mail size={11} /> Admin Email</div>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required placeholder="admin@college.edu" style={input} />
            </div>
            <div style={s({ marginBottom: 16 })}>
              <div style={label}><Key size={11} /> Admin Password</div>
              <div style={s({ display: 'flex', gap: 8 })}>
                <input value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required placeholder="Min 6 characters" style={{ ...input, flex: 1, fontFamily: 'monospace' }} />
                <button type="button" onClick={generatePassword} style={s({ padding: '8px 12px', background: '#7c3aed18', border: '1px solid #7c3aed30', borderRadius: 8, color: '#7c3aed', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const })}>Generate</button>
              </div>
            </div>
            <div style={s({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 })}>
              <div>
                <div style={label}>Plan</div>
                <select value={plan} onChange={e => setPlan(e.target.value)} style={{ ...input, appearance: 'none' as const }}>
                  <option value="free">Free</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div>
                <div style={label}><Users size={11} /> Max Users</div>
                <input type="number" value={maxUsers} onChange={e => setMaxUsers(Number(e.target.value))} min={1} style={input} />
              </div>
            </div>
            <div style={s({ display: 'flex', gap: 10 })}>
              <button type="button" onClick={onClose} style={s({ flex: 1, padding: 12, background: 'var(--sa-bg-elevated)', border: '1px solid var(--sa-border)', borderRadius: 10, cursor: 'pointer', color: 'var(--sa-text-secondary)', fontSize: 13, fontWeight: 500 })}>Cancel</button>
              <button type="submit" disabled={loading} style={s({ flex: 1, padding: 12, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', border: 'none', borderRadius: 10, cursor: 'pointer', color: 'white', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: loading ? 0.6 : 1 })}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />} {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
