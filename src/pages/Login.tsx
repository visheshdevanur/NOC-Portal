import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, Mail, KeyRound, Eye, EyeOff, ArrowRight, Building2 } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

type ResetStep = 'login' | 'request-otp' | 'verify-otp' | 'update-password';

const Login = () => {
  const navigate = useNavigate();
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

  // FIX #32: Brute force protection — track failed attempts
  const loginAttemptsRef = useRef(0);
  const lockoutUntilRef = useRef<number>(0);
  const [_lockoutSeconds, setLockoutSeconds] = useState(0);

  // FIX #50: OTP rate limiting — 60s cooldown between OTP requests
  const [otpCooldown, setOtpCooldown] = useState(0);

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

  // Step 0: Standard Login with brute force protection
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // FIX #32: Check lockout
    const now = Date.now();
    if (lockoutUntilRef.current > now) {
      const remaining = Math.ceil((lockoutUntilRef.current - now) / 1000);
      setError(`Too many failed attempts. Please wait ${remaining} seconds.`);
      return;
    }

    setLoading(true);
    resetAllStates();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // Reset attempts on success
      loginAttemptsRef.current = 0;
    } catch (err: any) {
      loginAttemptsRef.current++;
      // FIX #32: Lock out after 5 failed attempts for 30 seconds
      if (loginAttemptsRef.current >= 5) {
        lockoutUntilRef.current = Date.now() + 30000;
        setLockoutSeconds(30);
        const interval = setInterval(() => {
          setLockoutSeconds(prev => {
            if (prev <= 1) { clearInterval(interval); return 0; }
            return prev - 1;
          });
        }, 1000);
        loginAttemptsRef.current = 0;
        setError('Too many failed attempts. Please wait 30 seconds before trying again.');
      } else {
        // FIX #32: Generic error message to prevent email enumeration
        setError('Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Send OTP to email (with rate limiting)
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    // FIX #50: OTP cooldown
    if (otpCooldown > 0) {
      setError(`Please wait ${otpCooldown} seconds before requesting another OTP.`);
      return;
    }

    setLoading(true);
    resetAllStates();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;

      setSuccessMessage("An OTP has been sent to your email.");
      setResetStep('verify-otp');

      // FIX #50: Start 60s cooldown
      setOtpCooldown(60);
      const interval = setInterval(() => {
        setOtpCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
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
      // FIX #39: Use React Router navigate instead of window.location.href to avoid session race
      navigate('/update-password');
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
    // FIX #49: Client-side validation matching server policy
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one letter and one number");
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
      <section className="hidden md:flex md:w-[58%] relative overflow-hidden bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(220,90%,35%)] dark:from-[hsl(220,70%,20%)] dark:to-[hsl(230,50%,10%)] items-center justify-center p-12 lg:p-24">
        {/* Decorative gradient glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-400/30 dark:bg-blue-400/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-indigo-500/25 dark:bg-indigo-400/15 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-[30%] right-[10%] w-[25%] h-[25%] bg-cyan-400/10 dark:bg-cyan-400/10 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '10s' }} />

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

          <p className="text-blue-100/90 dark:text-blue-200/80 text-xl font-medium leading-relaxed mb-12">
            Experience a frictionless transition into your next academic chapter. Our editorial-grade interface streamlines departmental sign-offs, fee verifications, and document submissions with precision and security.
          </p>


        </div>
      </section>

      {/* ==================== RIGHT PANEL: LOGIN FORM ==================== */}
      <section className="w-full md:w-[42%] bg-background dark:bg-gradient-to-b dark:from-[hsl(224,30%,9%)] dark:to-[hsl(224,30%,6%)] flex flex-col items-center justify-center p-8 lg:p-16 relative min-h-screen">
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
            <div role="alert" aria-live="assertive" className="mb-6 bg-destructive/10 border-l-4 border-destructive p-4 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center">
                <Lock className="h-5 w-5 text-destructive mr-3 shrink-0" />
                <p className="text-sm font-medium text-destructive">{error}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div role="status" aria-live="polite" className="mb-6 bg-emerald-500/10 border-l-4 border-emerald-500 p-4 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{successMessage}</p>
            </div>
          )}

          {/* ============ LOGIN CARD (Glass) ============ */}
          <div className="bg-card/80 dark:bg-[hsl(224,28%,13%)] backdrop-blur-xl p-8 rounded-[2rem] shadow-[0px_32px_64px_-12px_rgba(0,75,202,0.08)] dark:shadow-[0px_8px_32px_-4px_rgba(0,0,0,0.5),0px_0px_0px_1px_rgba(56,120,255,0.06)] border border-border/40 dark:border-[hsl(220,20%,22%)]">
            
            {/* ---------------- LOGIN VIEW ---------------- */}
            {resetStep === 'login' && (
              <form className="space-y-7" onSubmit={handleLogin} aria-label="Login form">
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
                    className="block w-full px-0 pt-5 pb-2 bg-transparent border-0 border-b-2 border-border dark:border-[hsl(220,20%,25%)] focus:border-primary focus:ring-0 text-foreground transition-all duration-300 outline-none peer text-base"
                    style={{ WebkitTextFillColor: 'inherit' }}
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
                    className="block w-full px-0 pt-5 pb-2 bg-transparent border-0 border-b-2 border-border dark:border-[hsl(220,20%,25%)] focus:border-primary focus:ring-0 text-foreground transition-all duration-300 outline-none peer pr-10 text-base"
                    style={{ WebkitTextFillColor: 'inherit' }}
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
                      className="w-4 h-4 border-2 border-border dark:border-[hsl(220,20%,30%)] rounded accent-primary cursor-pointer dark:bg-transparent"
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
                  className="w-full py-4 px-6 bg-gradient-to-r from-primary to-[hsl(220,100%,50%)] dark:from-[hsl(217,91%,55%)] dark:to-[hsl(230,80%,60%)] text-white font-bold rounded-2xl shadow-[0_8px_20px_-6px_rgba(0,75,202,0.4)] dark:shadow-[0_8px_24px_-4px_rgba(59,130,246,0.35),0_0px_12px_-2px_rgba(59,130,246,0.2)] hover:shadow-[0_12px_28px_-6px_rgba(0,75,202,0.6)] dark:hover:shadow-[0_12px_32px_-4px_rgba(59,130,246,0.45),0_0px_16px_-2px_rgba(59,130,246,0.3)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 relative overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
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
