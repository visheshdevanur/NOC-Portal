import { useAuth } from '../lib/useAuth';
import StudentDashboard from '../components/dashboard/StudentDashboard';
import FacultyDashboard from '../components/dashboard/FacultyDashboard';
import HodDashboard from '../components/dashboard/HodDashboard';
import StaffDashboard from '../components/dashboard/StaffDashboard';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import AccountsDashboard from '../components/dashboard/AccountsDashboard';
import CoeDashboard from '../components/dashboard/CoeDashboard';

const DashboardRouter = () => {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return <div>Loading dashboard...</div>;
  }

  switch (profile.role) {
    case 'student':
      return <StudentDashboard />;
    case 'teacher':
    case 'faculty':
      return <FacultyDashboard />;
    case 'hod':
      return <HodDashboard />;
    case 'staff':
      return <StaffDashboard />;
    case 'admin':
      return <AdminDashboard />;
    case 'accounts':
      return <AccountsDashboard />;
    case 'coe':
      return <CoeDashboard />;
    default:
      return <div>Access Denied. Unknown role: {profile.role}</div>;
  }
};

export default DashboardRouter;
