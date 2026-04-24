import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import { supabase } from '../../lib/supabase';
import { LogOut, GraduationCap, UserCircle, KeyRound, X, Settings, Menu, Eye, EyeOff, Activity, IdCard, Building2, BookOpen, Hash, Calendar, Shield, Mail, Fingerprint, Clock } from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import { useState, useRef, useEffect } from 'react';

const Layout = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [detailsData, setDetailsData] = useState<{ departmentName: string; semesterName: string; email: string; lastSignIn: string | null } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const openDetailsModal = async () => {
    setShowDetailsModal(true);
    setLoadingDetails(true);
    try {
      const [deptRes, semRes, authRes] = await Promise.all([
        profile?.department_id
          ? supabase.from('departments').select('name').eq('id', profile.department_id).single()
          : Promise.resolve({ data: null }),
        profile?.semester_id
          ? supabase.from('semesters').select('name').eq('id', profile.semester_id).single()
          : Promise.resolve({ data: null }),
        supabase.auth.getUser(),
      ]);
      setDetailsData({
        departmentName: deptRes.data?.name || 'N/A',
        semesterName: semRes.data?.name || 'N/A',
        email: authRes.data?.user?.email || 'N/A',
        lastSignIn: authRes.data?.user?.last_sign_in_at || null,
      });
    } catch {
      setDetailsData({ departmentName: 'N/A', semesterName: 'N/A', email: 'N/A', lastSignIn: null });
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowMobileMenu(false);
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      
      setPasswordSuccess('Password securely updated.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setShowPasswordModal(false), 2000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-300">
      {/* Top Navigation Bar */}
      <nav className="bg-card/80 backdrop-blur-lg border-b border-border shadow-sm sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16">
            
            {/* Logo area */}
            <div className="flex items-center space-x-2 sm:space-x-3 group cursor-pointer min-w-0" onClick={() => navigate('/')}>
              <div className="bg-primary p-1.5 sm:p-2 rounded-lg sm:rounded-xl group-hover:bg-primary/90 transition-colors shadow-sm flex-shrink-0">
                <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-base sm:text-xl text-foreground tracking-tight block leading-tight truncate">NO DUE PORTAL</span>
                <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase tracking-wider block leading-tight border-t border-border pt-0.5 mt-0.5">
                  Clearance System
                </span>
              </div>
            </div>

            {/* Right Section: Desktop */}
            <div className="hidden sm:flex items-center space-x-3 lg:space-x-4">
              {profile?.role && profile.role !== 'student' && (
                <button
                  onClick={() => navigate('/logs')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-all shadow-sm font-medium text-sm"
                >
                  <Activity className="w-4 h-4" />
                  Logs
                </button>
              )}

              <ThemeToggle />
              
              <div className="flex items-center bg-secondary/50 px-3 lg:px-4 py-2 rounded-full border border-border shadow-sm">
                <UserCircle className="h-5 w-5 text-primary mr-2 flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground leading-tight truncate max-w-[120px] lg:max-w-[180px]">
                    {profile?.full_name || 'Loading user...'}
                  </span>
                  <span className="text-xs text-primary font-medium capitalize leading-tight">
                    {profile?.role}
                  </span>
                </div>
              </div>

              <div className="relative" ref={settingsMenuRef}>
                <button
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  className="inline-flex items-center justify-center p-2 rounded-xl text-foreground/50 hover:text-amber-500 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500 transition-all duration-200"
                  title="Settings"
                >
                  <Settings className="block h-5 w-5 border-transparent outline-none" aria-hidden="true" />
                </button>
                
                {showSettingsMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2">
                    <button
                      onClick={() => {
                        setShowSettingsMenu(false);
                        openDetailsModal();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-secondary flex items-center gap-2"
                    >
                      <IdCard className="w-4 h-4 text-primary" />
                      Account Info
                    </button>
                    <button
                      onClick={() => {
                        setShowSettingsMenu(false);
                        setShowPasswordModal(true);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-secondary flex items-center gap-2"
                    >
                      <KeyRound className="w-4 h-4 text-amber-500" />
                      Change Password
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center p-2 rounded-xl text-foreground/50 hover:text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-destructive transition-all duration-200"
                title="Sign out"
              >
                <LogOut className="block h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Sign out</span>
              </button>
            </div>

            {/* Right Section: Mobile */}
            <div className="flex sm:hidden items-center space-x-1" ref={mobileMenuRef}>
              <ThemeToggle />
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="inline-flex items-center justify-center p-2 rounded-xl text-foreground/70 hover:text-foreground hover:bg-secondary transition-all"
                title="Menu"
              >
                {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              {/* Mobile Dropdown Menu */}
              {showMobileMenu && (
                <div className="absolute top-14 right-2 left-2 bg-card border border-border rounded-2xl shadow-2xl py-3 z-50 animate-in fade-in slide-in-from-top-2">
                  {/* Profile Info */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border mb-2">
                    <div className="bg-primary/10 p-2 rounded-full flex-shrink-0">
                      <UserCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{profile?.full_name || 'Loading...'}</p>
                      <p className="text-xs text-primary font-medium capitalize">{profile?.role}</p>
                    </div>
                  </div>
                  
                  {profile?.role && profile.role !== 'student' && (
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        navigate('/logs');
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary flex items-center gap-3 transition-colors"
                    >
                      <Activity className="w-4 h-4 text-primary" />
                      Activity Logs
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      openDetailsModal();
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary flex items-center gap-3 transition-colors"
                  >
                    <IdCard className="w-4 h-4 text-primary" />
                    Account Info
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      setShowPasswordModal(true);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary flex items-center gap-3 transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    Change Password
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
            
          </div>
        </div>
      </nav>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
          <div className="bg-card rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl border border-border w-full max-w-sm relative">
            <button 
              onClick={() => setShowPasswordModal(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            
            <h3 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2 mb-5 sm:mb-6">
              <KeyRound className="w-5 h-5 text-amber-500" />
              Change Password
            </h3>

            {passwordError && (
              <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20">
                {passwordError}
              </div>
            )}
            
            {passwordSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm rounded-xl border border-emerald-500/20">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    required
                    className="w-full px-4 py-3 pr-10 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                  <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    required
                    className="w-full px-4 py-3 pr-10 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                  />
                  <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)} className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <button
                type="submit"
                disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                className="w-full mt-2 bg-amber-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-amber-600 transition-all shadow-sm disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
          <div className="bg-card rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl border border-border w-full max-w-md relative">
            <button 
              onClick={() => setShowDetailsModal(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center shadow-lg">
                <IdCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground">Account Info</h3>
                <p className="text-xs text-muted-foreground">Your complete account information</p>
              </div>
            </div>

            {loadingDetails ? (
              <div className="space-y-4 animate-pulse">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-14 bg-secondary rounded-xl" />)}
              </div>
            ) : (
              <div className="space-y-3">
                <DetailRow icon={<UserCircle className="w-4 h-4 text-primary" />} label="Full Name" value={profile?.full_name || 'N/A'} />
                <DetailRow icon={<Shield className="w-4 h-4 text-amber-500" />} label="Role" value={profile?.role || 'N/A'} capitalize />
                <DetailRow icon={<Mail className="w-4 h-4 text-violet-500" />} label="Email" value={detailsData?.email || 'N/A'} />
                {profile?.roll_number && (
                  <DetailRow icon={<Hash className="w-4 h-4 text-emerald-500" />} label="Roll Number" value={profile.roll_number} />
                )}
                <DetailRow icon={<Building2 className="w-4 h-4 text-blue-500" />} label="Department" value={detailsData?.departmentName || 'N/A'} />
                <DetailRow icon={<BookOpen className="w-4 h-4 text-teal-500" />} label="Semester" value={detailsData?.semesterName || 'N/A'} />
                {profile?.section && (
                  <DetailRow icon={<GraduationCap className="w-4 h-4 text-pink-500" />} label="Section" value={profile.section} />
                )}
                <DetailRow icon={<Fingerprint className="w-4 h-4 text-cyan-500" />} label="Account ID" value={profile?.id ? profile.id.substring(0, 8) + '...' : 'N/A'} />
                <DetailRow icon={<Calendar className="w-4 h-4 text-orange-500" />} label="Account Created" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'} />
                <DetailRow icon={<Clock className="w-4 h-4 text-rose-500" />} label="Last Sign In" value={detailsData?.lastSignIn ? new Date(detailsData.lastSignIn).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto py-4 sm:py-8 px-3 sm:px-6 lg:px-8 mt-1 sm:mt-2 animate-fade-in relative z-10">
        <Outlet />
      </main>
      
      {/* Footer */}
      <footer className="mt-auto bg-card border-t border-border py-4 sm:py-6 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex justify-center items-center">
           <p className="text-xs sm:text-sm text-foreground/50 text-center">© 2026 Institutional NO DUE PORTAL. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

// Detail row component for the My Details modal
function DetailRow({ icon, label, value, capitalize }: { icon: React.ReactNode; label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-secondary/50 border border-border hover:bg-secondary/80 transition-colors">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-background flex items-center justify-center border border-border shadow-sm">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight">{label}</p>
        <p className={`text-sm font-bold text-foreground truncate leading-snug mt-0.5 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

export default Layout;
