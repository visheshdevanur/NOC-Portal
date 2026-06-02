import { lazy, Suspense } from 'react';
import { useAuth } from '../lib/useAuth';
import { ErrorBoundary } from '../components/ErrorBoundary';
import TabErrorBoundary from '../components/TabErrorBoundary';

/**
 * Retry dynamic import — if a chunk fails (e.g. after Vercel deploys new code),
 * reload the page once to get fresh HTML pointing to correct chunk URLs.
 * Uses sessionStorage to prevent infinite reload loops.
 */
function lazyRetry(factory: () => Promise<any>) {
  return lazy(async () => {
    const key = 'chunk_reload_' + factory.toString().slice(0, 60);
    try {
      const module = await factory();
      // Successful load — clear any reload flag
      sessionStorage.removeItem(key);
      return module;
    } catch (err) {
      // If we haven't already reloaded for this chunk, do so
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a dummy to satisfy TS while reload happens
        return { default: () => null };
      }
      throw err; // Already reloaded once, let error boundary handle it
    }
  });
}

const StudentDashboard = lazyRetry(() => import('../components/dashboard/StudentDashboard'));
const FacultyDashboard = lazyRetry(() => import('../components/dashboard/FacultyDashboard'));
const HodDashboard = lazyRetry(() => import('../components/dashboard/HodDashboard'));
const StaffDashboard = lazyRetry(() => import('../components/dashboard/StaffDashboard'));
const ClerkDashboard = lazyRetry(() => import('../components/dashboard/ClerkDashboard'));
const AdminDashboard = lazyRetry(() => import('../components/dashboard/AdminDashboard'));
const AccountsDashboard = lazyRetry(() => import('../components/dashboard/AccountsDashboard'));

const FycDashboard = lazyRetry(() => import('../components/dashboard/FycDashboard'));
const LibraryDashboard = lazyRetry(() => import('../pages/LibraryDashboard'));
const CoeDashboard = lazyRetry(() => import('../components/dashboard/CoeDashboard'));

const DashboardFallback = () => (
  <div className="space-y-6 animate-pulse">
    <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
      <div className="h-8 bg-secondary rounded-xl w-64 mb-3" />
      <div className="h-4 bg-secondary rounded-lg w-96" />
    </div>
    <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border flex gap-1">
      {[1,2,3].map(i => <div key={i} className="flex-1 h-12 bg-secondary rounded-xl" />)}
    </div>
    <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
      <div className="space-y-4">
        {[1,2,3,4].map(i => <div key={i} className="h-14 bg-secondary rounded-xl" />)}
      </div>
    </div>
  </div>
);

const DashboardRouter = () => {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return <DashboardFallback />;
  }

  const roleName = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

  const getDashboard = () => {
    switch (profile.role) {
      case 'student': return <StudentDashboard />;
      case 'teacher':
      case 'faculty': return <FacultyDashboard />;
      case 'hod': return <HodDashboard />;
      case 'staff': return <StaffDashboard />;
      case 'clerk': return <ClerkDashboard />;
      case 'principal':
      case 'admin': return <AdminDashboard />;
      case 'accounts': return <AccountsDashboard />;

      case 'fyc': return <FycDashboard />;
      case 'librarian': return <LibraryDashboard />;
      case 'coe': return <CoeDashboard />;
      default: return <div>Access Denied. Unknown role: {profile.role}</div>;
    }
  };

  return (
    <ErrorBoundary dashboardName={profile.role}>
      <Suspense fallback={<DashboardFallback />}>
        <TabErrorBoundary tabName={`${roleName} Dashboard`}>
          {getDashboard()}
        </TabErrorBoundary>
      </Suspense>
    </ErrorBoundary>
  );
};

export default DashboardRouter;
