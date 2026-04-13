import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { GraduationCap, Lock, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
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

      // They are fully updated and logged in, dashboard router will naturally take over.
      alert('Password successfully changed! Proceeding to your account...');
      window.location.reload(); // Hard reload to force router to pick up the new session cleanly
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors duration-300">

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 fade-in">
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-primary/10 rounded-3xl shadow-sm border border-primary/20 flex items-center justify-center transform hover:rotate-12 transition-transform duration-300">
            <GraduationCap className="h-10 w-10 text-primary" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground tracking-tight">
          NOC Portal
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {resetStep === 'login' && "Sign in to your clearance account"}
          {resetStep === 'request-otp' && "Reset your password"}
          {resetStep === 'verify-otp' && "Verify your email identity"}
          {resetStep === 'update-password' && "Setup your new password"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 fade-in">
        <div className="bg-card/80 backdrop-blur-xl py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10 border border-border">

          {error && (
            <div className="mb-6 bg-destructive/10 border-l-4 border-destructive p-4 rounded-xl">
              <div className="flex items-center">
                <Lock className="h-5 w-5 text-destructive mr-3" />
                <p className="text-sm font-medium text-destructive">{error}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 bg-emerald-500/10 border-l-4 border-emerald-500 p-4 rounded-xl">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{successMessage}</p>
            </div>
          )}

          {/* ---------------- LOGIN VIEW ---------------- */}
          {resetStep === 'login' && (
            <form className="space-y-6 animate-in fade-in" onSubmit={handleLogin}>
              <div>
                <label className="block text-sm font-medium text-foreground">Email address</label>
                <div className="mt-2 relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-border rounded-xl shadow-sm text-foreground bg-background focus:ring-2 focus:ring-primary pl-10 sm:text-sm"
                    placeholder="name@example.com"
                  />
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-foreground">Password</label>
                  <button
                    type="button"
                    onClick={() => { setResetStep('request-otp'); resetAllStates(); }}
                    className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Forgot your password?
                  </button>
                </div>
                <div className="mt-2 relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-border rounded-xl shadow-sm text-foreground bg-background focus:ring-2 focus:ring-primary pl-10 pr-10 sm:text-sm"
                    placeholder="••••••••"
                  />
                  <Lock className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Authenticating...' : 'Sign in'}
              </button>
            </form>
          )}

          {/* ---------------- REQUEST OTP VIEW ---------------- */}
          {resetStep === 'request-otp' && (
            <form className="space-y-6 animate-in slide-in-from-right-4" onSubmit={handleSendOTP}>
              <p className="text-sm text-muted-foreground">We will send an 8-digit confirmation code to your email.</p>
              <div>
                <label className="block text-sm font-medium text-foreground">Email address</label>
                <div className="mt-2 relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-border rounded-xl shadow-sm text-foreground bg-background focus:ring-2 focus:ring-primary pl-10 sm:text-sm"
                    placeholder="name@example.com"
                  />
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending OTP...' : 'Send Recovery OTP'}
              </button>
              <div className="text-center">
                <button type="button" onClick={switchToLogin} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ---------------- VERIFY OTP VIEW ---------------- */}
          {resetStep === 'verify-otp' && (
            <form className="space-y-6 animate-in slide-in-from-right-4" onSubmit={handleVerifyOTP}>
              <div>
                <label className="block text-sm font-medium text-foreground">8-Digit Verification Code</label>
                <div className="mt-2 relative">
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    className="appearance-none block w-full px-4 py-3 border border-border rounded-xl shadow-sm text-foreground bg-background focus:ring-2 focus:ring-primary text-center tracking-[0.4em] text-xl font-mono sm:text-xl"
                    placeholder="00000000"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 8}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify Secure OTP'}
              </button>
              <div className="text-center">
                <button type="button" onClick={switchToLogin} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                  Cancel Verification
                </button>
              </div>
            </form>
          )}

          {/* ---------------- UPDATE PASSWORD VIEW ---------------- */}
          {resetStep === 'update-password' && (
            <form className="space-y-6 animate-in slide-in-from-right-4" onSubmit={handleUpdatePassword}>
              <div>
                <label className="block text-sm font-medium text-foreground">New Password</label>
                <div className="mt-2 relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-border rounded-xl shadow-sm text-foreground bg-background focus:ring-2 focus:ring-primary pl-10 pr-10 sm:text-sm"
                    placeholder="••••••••"
                  />
                  <KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Confirm New Password</label>
                <div className="mt-2 relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-border rounded-xl shadow-sm text-foreground bg-background focus:ring-2 focus:ring-primary pl-10 pr-10 sm:text-sm"
                    placeholder="••••••••"
                  />
                  <KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || newPassword.length < 6}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save New Password'}
              </button>
            </form>
          )}



        </div>
      </div>

      {/* Background Graphic Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-3xl"></div>
      </div>
    </div>
  );
};

export default Login;
