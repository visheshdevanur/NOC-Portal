import { lazy, Suspense } from 'react';
import { useAuth } from '../lib/useAuth';

const StudentDashboard = lazy(() => import('../components/dashboard/StudentDashboard'));
const FacultyDashboard = lazy(() => import('../components/dashboard/FacultyDashboard'));
const HodDashboard = lazy(() => import('../components/dashboard/HodDashboard'));
const StaffDashboard = lazy(() => import('../components/dashboard/StaffDashboard'));
const AdminDashboard = lazy(() => import('../components/dashboard/AdminDashboard'));
const AccountsDashboard = lazy(() => import('../components/dashboard/AccountsDashboard'));
const CoeDashboard = lazy(() => import('../components/dashboard/CoeDashboard'));

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

  const getDashboard = () => {
    switch (profile.role) {
      case 'student': return <StudentDashboard />;
      case 'teacher':
      case 'faculty': return <FacultyDashboard />;
      case 'hod': return <HodDashboard />;
      case 'staff': return <StaffDashboard />;
      case 'admin': return <AdminDashboard />;
      case 'accounts': return <AccountsDashboard />;
      case 'coe': return <CoeDashboard />;
      default: return <div>Access Denied. Unknown role: {profile.role}</div>;
    }
  };

  return (
    <Suspense fallback={<DashboardFallback />}>
      {getDashboard()}
    </Suspense>
  );
};

export default DashboardRouter;
