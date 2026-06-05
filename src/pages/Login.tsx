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

  // FIX #32: Brute force protection — track failed attempts (persisted to survive refresh, S-1)
  const loginAttemptsRef = useRef(parseInt(localStorage.getItem('noc_login_attempts') || '0', 10));
  const lockoutUntilRef = useRef<number>(parseInt(localStorage.getItem('noc_lockout_until') || '0', 10));
  const [_lockoutSeconds, setLockoutSeconds] = useState(0);

  // FIX #50: OTP rate limiting — 60s cooldown between OTP requests
  const [otpCooldown, setOtpCooldown] = useState(0);

  // S-22: OTP attempt counter — max 2 failed attempts before blocking
  const otpAttemptsRef = useRef(0);

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
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      // Reset attempts on success
      loginAttemptsRef.current = 0;
      localStorage.removeItem('noc_login_attempts');
      localStorage.removeItem('noc_lockout_until');
    } catch (err: any) {
      loginAttemptsRef.current++;
      localStorage.setItem('noc_login_attempts', String(loginAttemptsRef.current));
      // FIX #32: Lock out after 5 failed attempts for 30 seconds
      if (loginAttemptsRef.current >= 5) {
        const lockoutEnd = Date.now() + 30000;
        lockoutUntilRef.current = lockoutEnd;
        localStorage.setItem('noc_lockout_until', String(lockoutEnd));
        setLockoutSeconds(30);
        const interval = setInterval(() => {
          setLockoutSeconds(prev => {
            if (prev <= 1) { clearInterval(interval); return 0; }
            return prev - 1;
          });
        }, 1000);
        loginAttemptsRef.current = 0;
        localStorage.setItem('noc_login_attempts', '0');
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (error) throw error;

      setSuccessMessage("If this email is registered, an OTP has been sent. Please check your inbox.");
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

  // Step 2: Verify the 8-digit OTP (S-22: max 2 failed attempts)
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    // S-22: Block after 2 failed OTP attempts
    if (otpAttemptsRef.current >= 2) {
      setError('Too many failed OTP attempts. Please request a new OTP.');
      return;
    }

    setLoading(true);
    resetAllStates();

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery',
      });

      if (error) throw error;

      // S-22: Reset OTP attempts on success
      otpAttemptsRef.current = 0;

      // S-23: Only set flag if we have a valid recovery session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        sessionStorage.setItem('password_reset_pending', 'true');
      }
      // FIX #39: Use React Router navigate instead of window.location.href to avoid session race
      navigate('/update-password');
    } catch (err: any) {
      otpAttemptsRef.current++;
      const attemptsLeft = 2 - otpAttemptsRef.current;
      setError(attemptsLeft > 0
        ? `Invalid or expired OTP. ${attemptsLeft} attempt(s) remaining.`
        : 'Too many failed OTP attempts. Please request a new OTP.');
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
    <div className="min-h-screen relative overflow-hidden">
      {/* ==================== FULL-SCREEN BACKGROUND IMAGE ==================== */}
      <div className="absolute inset-0">
        <img
          src="/campus-bg.png"
          alt="College Campus"
          className="w-full h-full object-cover"
        />
        {/* Gradient overlay: strong on left, lighter on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(0,40,100,0.75)] via-[rgba(0,60,130,0.45)] to-[rgba(200,220,255,0.25)]" />
        {/* Bottom fade for footer readability */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[rgba(200,215,240,0.6)] to-transparent" />
      </div>

      {/* ==================== THEME TOGGLE (Top Right) ==================== */}
      <div className="absolute top-6 right-6 z-30">
        <ThemeToggle />
      </div>

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1 flex flex-col md:flex-row items-center justify-between px-6 md:px-12 lg:px-20 py-12">

          {/* ==================== LEFT: BRAND OVERLAY ==================== */}
          <div className="hidden md:flex flex-col justify-center max-w-xl lg:max-w-2xl">
            {/* Logo */}
            <div className="mb-10 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-lg flex items-center justify-center shadow-lg">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-white font-extrabold text-xl tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                NO DUE PORTAL
              </h1>
            </div>

            {/* Hero Text */}
            <h2 className="text-white text-5xl lg:text-7xl font-extrabold tracking-tight mb-8 leading-[1.05] drop-shadow-[0_2px_12px_rgba(0,0,0,0.3)]" style={{ fontFamily: 'Manrope, sans-serif' }}>
              College<br />Clearance<br />Portal
            </h2>

            <p className="text-white/85 text-lg lg:text-xl font-medium leading-relaxed max-w-md drop-shadow-[0_1px_6px_rgba(0,0,0,0.2)]">
              Experience a frictionless transition into your next academic chapter. Our editorial-grade interface streamlines departmental sign-offs, fee verifications, and document submissions with precision and security.
            </p>
          </div>

          {/* ==================== RIGHT: LOGIN CARD ==================== */}
          <div className="w-full md:w-auto md:min-w-[400px] lg:min-w-[420px] md:ml-8 lg:ml-16">
            {/* Mobile Header */}
            <div className="md:hidden flex items-center gap-2 mb-6">
              <Building2 className="w-6 h-6 text-white" />
              <span className="font-extrabold text-white text-xl tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                NO DUE PORTAL
              </span>
            </div>

            {/* Glass Card */}
            <div className="bg-white/90 dark:bg-[hsl(224,28%,13%)]/95 backdrop-blur-2xl rounded-[2rem] shadow-[0_32px_80px_-12px_rgba(0,0,0,0.25)] border border-white/30 dark:border-[hsl(220,20%,22%)] p-8 lg:p-10">
              {/* Welcome Text */}
              <div className="mb-8">
                <h3 className="text-2xl font-extrabold text-gray-900 dark:text-foreground mb-1.5 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  {resetStep === 'login' && 'Welcome Back'}
                  {resetStep === 'request-otp' && 'Reset Password'}
                  {resetStep === 'verify-otp' && 'Verify Identity'}
                  {resetStep === 'update-password' && 'New Password'}
                </h3>
                <p className="text-gray-500 dark:text-muted-foreground font-medium text-sm">
                  {resetStep === 'login' && 'Log in to manage your university clearance status.'}
                  {resetStep === 'request-otp' && 'We\'ll send a recovery code to your email.'}
                  {resetStep === 'verify-otp' && 'Enter the 8-digit code sent to your email.'}
                  {resetStep === 'update-password' && 'Choose a strong new password for your account.'}
                </p>
              </div>

              {/* Error & Success Messages */}
              {error && (
                <div role="alert" aria-live="assertive" className="mb-5 bg-red-50 dark:bg-destructive/10 border-l-4 border-red-500 dark:border-destructive p-3 rounded-xl">
                  <div className="flex items-center">
                    <Lock className="h-4 w-4 text-red-500 dark:text-destructive mr-2.5 shrink-0" />
                    <p className="text-sm font-medium text-red-600 dark:text-destructive">{error}</p>
                  </div>
                </div>
              )}

              {successMessage && (
                <div role="status" aria-live="polite" className="mb-5 bg-emerald-50 dark:bg-emerald-500/10 border-l-4 border-emerald-500 p-3 rounded-xl">
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{successMessage}</p>
                </div>
              )}

              {/* ---- LOGIN VIEW ---- */}
              {resetStep === 'login' && (
                <form className="space-y-6" onSubmit={handleLogin} aria-label="Login form">
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

          </div>
        </div>

        {/* ==================== FOOTER ==================== */}
        <div className="relative z-10 pb-6 flex flex-wrap justify-center gap-6 text-[10px] uppercase tracking-[0.15em] text-white/60 font-medium">
          <span>© {new Date().getFullYear()} NO DUE PORTAL</span>
          <span className="hover:text-white cursor-pointer transition-colors">Privacy Policy</span>
          <span className="hover:text-white cursor-pointer transition-colors">Accessibility</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
