import { useState } from 'react';
import { isSuperAdminLoggedIn } from '../../lib/superAdminAuth';
import SuperAdminLogin from './SuperAdminLogin';
import SuperAdminDashboard from './SuperAdminDashboard';

/**
 * SuperAdminApp — self-contained app for the /superadmin route.
 * Handles its own login state, completely independent of the
 * regular NOC portal auth flow.
 */
export default function SuperAdminApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(isSuperAdminLoggedIn());

  if (!isLoggedIn) {
    return <SuperAdminLogin onLogin={() => setIsLoggedIn(true)} />;
  }

  return <SuperAdminDashboard onLogout={() => setIsLoggedIn(false)} />;
}
