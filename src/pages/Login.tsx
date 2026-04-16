import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Mail, KeyRound, Eye, EyeOff, ArrowRight, Building2, Shield, Clock } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

type ResetStep = 'login' | 'request-otp' | 'verify-otp' | 'update-password';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // OTP States
  const [resetStep, setResetStep] = useState<ResetStep>('login');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Focus state for floating labels
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const resetAllStates = () => {
    setError(null);
    setSuccessMessage(null);
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const switchToLogin = () => {
    setResetStep('login');
    resetAllStates();
  };

  // Step 0: Standard Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    resetAllStates();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Send OTP to email
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    resetAllStates();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;

      setSuccessMessage("An OTP has been sent to your email.");
      setResetStep('verify-otp');
    } catch (err: any) {
      setError(err.message || 'Error sending OTP');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the 8-digit OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    resetAllStates();

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery',
      });

      if (error) throw error;

      // Flag that we're in password-reset mode so App.tsx doesn't redirect to dashboard
      sessionStorage.setItem('password_reset_pending', 'true');
      // Hard redirect to the update-password page
      window.location.href = '/update-password';
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP');
      setSuccessMessage(null);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    resetAllStates();

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      alert('Password successfully changed! Proceeding to your account...');
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const emailLabelActive = emailFocused || email.length > 0;
  const passwordLabelActive = passwordFocused || password.length > 0;

  return (
    <div className="min-h-screen flex flex-col md:flex-row transition-colors duration-300">

      {/* ==================== LEFT PANEL: BRAND ==================== */}
      <section className="hidden md:flex md:w-[58%] relative overflow-hidden bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(220,90%,35%)] dark:from-[hsl(220,60%,15%)] dark:to-[hsl(220,80%,8%)] items-center justify-center p-12 lg:p-24">
        {/* Decorative gradient glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-400/30 dark:bg-blue-500/15 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-indigo-500/25 dark:bg-indigo-400/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />

        <div className="relative z-10 max-w-2xl">
          {/* Logo */}
          <div className="mb-12 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-lg flex items-center justify-center shadow-lg">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white font-extrabold text-2xl tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              NO DUE PORTAL
            </h1>
          </div>

          {/* Hero Text */}
          <h2 className="text-white text-5xl lg:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]" style={{ fontFamily: 'Manrope, sans-serif' }}>
            College<br />Clearance<br />Portal
          </h2>

          <p className="text-blue-100/90 dark:text-blue-200/70 text-xl font-medium leading-relaxed mb-12">
            Experience a frictionless transition into your next academic chapter. Our editorial-grade interface streamlines departmental sign-offs, fee verifications, and document submissions with precision and security.
          </p>

          {/* Status Bento Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl border border-white/10 bg-white/10 dark:bg-white/5 backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-white/50" />
                <p className="text-white/60 text-xs font-medium uppercase tracking-[0.15em]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Clearance Rate
                </p>
              </div>
              <p className="text-white text-3xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>98.4%</p>
            </div>
            <div className="p-6 rounded-3xl border border-white/10 bg-white/10 dark:bg-white/5 backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-white/50" />
                <p className="text-white/60 text-xs font-medium uppercase tracking-[0.15em]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Avg. Processing
                </p>
              </div>
              <p className="text-white text-3xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>2.4h</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== RIGHT PANEL: LOGIN FORM ==================== */}
      <section className="w-full md:w-[42%] bg-background flex flex-col items-center justify-center p-8 lg:p-16 relative min-h-screen">
        {/* Theme Toggle */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        {/* Mobile Header */}
        <div className="md:hidden w-full flex items-center gap-2 mb-10">
          <Building2 className="w-6 h-6 text-primary" />
          <span className="font-extrabold text-primary text-xl tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            NO DUE PORTAL
          </span>
        </div>

        <div className="w-full max-w-md">
          {/* Welcome Text */}
          <div className="mb-10">
            <h3 className="text-3xl font-extrabold text-foreground mb-2 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {resetStep === 'login' && 'Welcome Back'}
              {resetStep === 'request-otp' && 'Reset Password'}
              {resetStep === 'verify-otp' && 'Verify Identity'}
              {resetStep === 'update-password' && 'New Password'}
            </h3>
            <p className="text-muted-foreground font-medium">
              {resetStep === 'login' && 'Log in to manage your university clearance status.'}
              {resetStep === 'request-otp' && 'We\'ll send a recovery code to your email.'}
              {resetStep === 'verify-otp' && 'Enter the 8-digit code sent to your email.'}
              {resetStep === 'update-password' && 'Choose a strong new password for your account.'}
            </p>
          </div>

          {/* Error & Success Messages */}
          {error && (
            <div className="mb-6 bg-destructive/10 border-l-4 border-destructive p-4 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center">
                <Lock className="h-5 w-5 text-destructive mr-3 shrink-0" />
                <p className="text-sm font-medium text-destructive">{error}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 bg-emerald-500/10 border-l-4 border-emerald-500 p-4 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{successMessage}</p>
            </div>
          )}

          {/* ============ LOGIN CARD (Glass) ============ */}
          <div className="bg-card/80 dark:bg-card/60 backdrop-blur-xl p-8 rounded-[2rem] shadow-[0px_32px_64px_-12px_rgba(0,75,202,0.08)] dark:shadow-[0px_32px_64px_-12px_rgba(0,0,0,0.3)] border border-border/40 dark:border-border/60">
            
            {/* ---------------- LOGIN VIEW ---------------- */}
            {resetStep === 'login' && (
              <form className="space-y-7" onSubmit={handleLogin}>
                {/* Floating Email Input */}
                <div className="relative group">
                  <input
                    type="email"
                    id="login-email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    className="block w-full px-0 pt-5 pb-2 bg-transparent border-0 border-b-2 border-border focus:border-primary focus:ring-0 text-foreground transition-all duration-300 outline-none peer text-base"
                    placeholder=" "
                  />
                  <label
                    htmlFor="login-email"
                    className={`absolute left-0 pointer-events-none font-medium transition-all duration-300 origin-left z-10 ${
                      emailLabelActive
                        ? 'text-primary text-xs top-0 scale-90'
                        : 'text-muted-foreground text-base top-5'
                    }`}
                  >
                    Email Address
                  </label>
                  {/* Focus underline glow */}
                  <div className="absolute bottom-0 left-1/2 w-0 h-[2px] bg-primary transition-all duration-300 peer-focus:left-0 peer-focus:w-full rounded-full" />
                  <Mail className={`absolute right-0 top-5 w-4 h-4 transition-colors duration-200 ${emailFocused ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                {/* Floating Password Input */}
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    className="block w-full px-0 pt-5 pb-2 bg-transparent border-0 border-b-2 border-border focus:border-primary focus:ring-0 text-foreground transition-all duration-300 outline-none peer pr-10 text-base"
                    placeholder=" "
                  />
                  <label
                    htmlFor="login-password"
                    className={`absolute left-0 pointer-events-none font-medium transition-all duration-300 origin-left z-10 ${
                      passwordLabelActive
                        ? 'text-primary text-xs top-0 scale-90'
                        : 'text-muted-foreground text-base top-5'
                    }`}
                  >
                    Password
                  </label>
                  <div className="absolute bottom-0 left-1/2 w-0 h-[2px] bg-primary transition-all duration-300 peer-focus:left-0 peer-focus:w-full rounded-full" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-5 text-muted-foreground hover:text-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Remember + Forgot */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="remember-me"
                      className="w-4 h-4 border-2 border-border rounded accent-primary cursor-pointer"
                    />
                    <label htmlFor="remember-me" className="text-sm text-muted-foreground font-medium cursor-pointer">
                      Keep me active
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setResetStep('request-otp'); resetAllStates(); }}
                    className="text-sm font-bold text-primary hover:text-primary/80 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Submit Button — Gradient Bento Style */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 px-6 bg-gradient-to-r from-primary to-[hsl(220,100%,50%)] dark:from-primary dark:to-[hsl(220,80%,55%)] text-white font-bold rounded-2xl shadow-[0_8px_20px_-6px_rgba(0,75,202,0.4)] hover:shadow-[0_12px_28px_-6px_rgba(0,75,202,0.6)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 relative overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
                  style={{ fontFamily: 'Manrope, sans-serif' }}
                >
                  {/* Inner glow border */}
                  <div className="absolute inset-0 border-t border-white/20 rounded-2xl pointer-events-none" />
                  <span className="text-base">{loading ? 'Authenticating...' : 'Authorize Access'}</span>
                  {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                  {loading && (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                </button>
              </form>
            )}

            {/* ---------------- REQUEST OTP VIEW ---------------- */}
            {resetStep === 'request-otp' && (
              <form className="space-y-7 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handleSendOTP}>
                <p className="text-sm text-muted-foreground">We will send an 8-digit confirmation code to your email.</p>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full px-0 py-3 bg-transparent border-0 border-b-2 border-border focus:border-primary focus:ring-0 text-foreground transition-all duration-300 outline-none text-base"
                    placeholder="name@example.com"
                  />
                  <Mail className="absolute right-0 top-3.5 w-4 h-4 text-muted-foreground" />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-4 px-6 bg-gradient-to-r from-primary to-[hsl(220,100%,50%)] text-white font-bold rounded-2xl shadow-[0_8px_20px_-6px_rgba(0,75,202,0.4)] hover:shadow-[0_12px_28px_-6px_rgba(0,75,202,0.6)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Manrope, sans-serif' }}
                >
                  <div className="absolute inset-0 border-t border-white/20 rounded-2xl pointer-events-none" />
                  {loading ? 'Sending OTP...' : 'Send Recovery OTP'}
                </button>
                <div className="text-center">
                  <button type="button" onClick={switchToLogin} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {/* ---------------- VERIFY OTP VIEW ---------------- */}
            {resetStep === 'verify-otp' && (
              <form className="space-y-7 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handleVerifyOTP}>
                <div className="relative">
                  <label className="block text-sm font-medium text-foreground mb-2">8-Digit Verification Code</label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    className="block w-full px-4 py-4 bg-secondary/50 border-2 border-border focus:border-primary focus:ring-0 rounded-2xl text-foreground text-center tracking-[0.4em] text-xl font-mono transition-all duration-300 outline-none"
                    placeholder="00000000"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 8}
                  className="w-full py-4 px-6 bg-gradient-to-r from-primary to-[hsl(220,100%,50%)] text-white font-bold rounded-2xl shadow-[0_8px_20px_-6px_rgba(0,75,202,0.4)] hover:shadow-[0_12px_28px_-6px_rgba(0,75,202,0.6)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Manrope, sans-serif' }}
                >
                  <div className="absolute inset-0 border-t border-white/20 rounded-2xl pointer-events-none" />
                  {loading ? 'Verifying...' : 'Verify Secure OTP'}
                </button>
                <div className="text-center">
                  <button type="button" onClick={switchToLogin} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    ← Cancel Verification
                  </button>
                </div>
              </form>
            )}

            {/* ---------------- UPDATE PASSWORD VIEW ---------------- */}
            {resetStep === 'update-password' && (
              <form className="space-y-7 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handleUpdatePassword}>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-0 py-3 bg-transparent border-0 border-b-2 border-border focus:border-primary focus:ring-0 text-foreground transition-all duration-300 outline-none pr-10 text-base"
                    placeholder="New Password"
                  />
                  <KeyRound className="absolute left-0 top-3.5 w-4 h-4 text-muted-foreground" />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-0 top-3.5 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full px-0 py-3 bg-transparent border-0 border-b-2 border-border focus:border-primary focus:ring-0 text-foreground transition-all duration-300 outline-none pr-10 text-base"
                    placeholder="Confirm New Password"
                  />
                  <KeyRound className="absolute left-0 top-3.5 w-4 h-4 text-muted-foreground" />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-0 top-3.5 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading || newPassword.length < 6}
                  className="w-full py-4 px-6 bg-gradient-to-r from-primary to-[hsl(220,100%,50%)] text-white font-bold rounded-2xl shadow-[0_8px_20px_-6px_rgba(0,75,202,0.4)] hover:shadow-[0_12px_28px_-6px_rgba(0,75,202,0.6)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Manrope, sans-serif' }}
                >
                  <div className="absolute inset-0 border-t border-white/20 rounded-2xl pointer-events-none" />
                  {loading ? 'Saving...' : 'Save New Password'}
                </button>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium">
            <span>© {new Date().getFullYear()} NO DUE PORTAL</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Privacy Policy</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Accessibility</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Login;
