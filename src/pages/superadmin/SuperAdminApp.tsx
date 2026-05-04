import { useState, createContext, useContext } from 'react';
import { isSuperAdminLoggedIn } from '../../lib/superAdminAuth';
import SuperAdminLogin from './SuperAdminLogin';
import SuperAdminDashboard from './SuperAdminDashboard';

type Theme = 'dark' | 'light';
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });
export const useSATheme = () => useContext(ThemeCtx);

export default function SuperAdminApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(isSuperAdminLoggedIn());
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('sa-theme') as Theme) || 'dark');

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sa-theme', next);
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <div className={theme === 'dark' ? 'sa-dark' : 'sa-light'}>
        {!isLoggedIn
          ? <SuperAdminLogin onLogin={() => setIsLoggedIn(true)} />
          : <SuperAdminDashboard onLogout={() => setIsLoggedIn(false)} />
        }
      </div>
    </ThemeCtx.Provider>
  );
}
