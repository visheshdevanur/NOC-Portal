import { useState } from 'react';
import { validateSuperAdmin, loginSuperAdmin } from '../../lib/superAdminAuth';
import { Shield, Lock, Mail, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function SuperAdminLogin({ onLogin }: { onLogin: () => void }) {
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
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] relative overflow-hidden">
      {/* Ambient effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-600/8 blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
      
      <div className="w-full max-w-md mx-4 relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_8px_32px_-4px_rgba(124,58,237,0.4)] mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Developer Portal
          </h1>
          <p className="text-sm text-white/40 mt-2 font-medium">NOC Platform — Super Admin Access</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-3xl p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]">
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-2">Email</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all text-sm"
                  placeholder="superadmin@nocportal.dev"
                />
                <Mail className="absolute right-3 top-3.5 w-4 h-4 text-white/20" />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/30 font-bold mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all text-sm pr-10"
                  placeholder="••••••••••"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3.5 text-white/20 hover:text-white/50 transition-colors">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl shadow-[0_8px_24px_-4px_rgba(124,58,237,0.4)] hover:shadow-[0_12px_32px_-4px_rgba(124,58,237,0.6)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-60"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Authenticate</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/20 mt-6">
          © {new Date().getFullYear()} NOC Platform · Restricted Access
        </p>
      </div>
    </div>
  );
}
