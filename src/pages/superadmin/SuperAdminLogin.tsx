import { useState } from 'react';
import { validateSuperAdmin, loginSuperAdmin } from '../../lib/superAdminAuth';
import { useSATheme } from './SuperAdminApp';
import { Shield, Lock, Mail, ArrowRight, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import './superadmin.css';

export default function SuperAdminLogin({ onLogin }: { onLogin: () => void }) {
  const { theme, toggle } = useSATheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (validateSuperAdmin(email, password)) {
        loginSuperAdmin();
        onLogin();
      } else {
        setError('Invalid credentials. Access denied.');
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div style={{ background: 'var(--sa-bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', fontFamily: 'Inter, Manrope, system-ui, sans-serif' }}>
      {/* Theme toggle */}
      <button onClick={toggle} style={{ position: 'absolute', top: 24, right: 24, width: 40, height: 40, borderRadius: 12, background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sa-text-secondary)', transition: 'all 0.2s' }}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', boxShadow: '0 8px 24px -4px rgba(124,58,237,0.35)', marginBottom: 20 }}>
            <Shield size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--sa-text)', letterSpacing: '-0.02em', margin: '0 0 6px' }}>Developer Portal</h1>
          <p style={{ fontSize: 13, color: 'var(--sa-text-muted)', fontWeight: 500, margin: 0 }}>NOC Platform · Super Admin</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 20, padding: 32, boxShadow: 'var(--sa-shadow-lg)' }}>
          {error && (
            <div style={{ marginBottom: 20, padding: '10px 14px', background: theme === 'dark' ? 'rgba(248,113,113,0.08)' : 'rgba(220,38,38,0.06)', border: `1px solid ${theme === 'dark' ? 'rgba(248,113,113,0.15)' : 'rgba(220,38,38,0.12)'}`, borderRadius: 12, color: 'var(--sa-danger)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Email</label>
              <div style={{ position: 'relative' }}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="superadmin@nocportal.dev"
                  style={{ width: '100%', padding: '12px 40px 12px 14px', background: 'var(--sa-bg-input)', border: '1px solid var(--sa-border)', borderRadius: 12, color: 'var(--sa-text)', fontSize: 14, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#7c3aed'} onBlur={e => e.target.style.borderColor = 'var(--sa-border)'} />
                <Mail size={14} style={{ position: 'absolute', right: 14, top: 15, color: 'var(--sa-text-muted)' }} />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••••"
                  style={{ width: '100%', padding: '12px 40px 12px 14px', background: 'var(--sa-bg-input)', border: '1px solid var(--sa-border)', borderRadius: 12, color: 'var(--sa-text)', fontSize: 14, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#7c3aed'} onBlur={e => e.target.style.borderColor = 'var(--sa-border)'} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sa-text-muted)', padding: 4 }}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px 20px', background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', color: 'white', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 12, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px -4px rgba(124,58,237,0.4)', opacity: loading ? 0.7 : 1, transition: 'all 0.2s' }}>
              {loading ? <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <><span>Sign In</span><ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--sa-text-muted)', marginTop: 24 }}>
          © {new Date().getFullYear()} NOC Platform · Restricted Access
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
