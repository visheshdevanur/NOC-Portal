import { useState, useEffect, createContext, useContext } from 'react';
import { isSuperAdminLoggedIn } from '../../lib/superAdminAuth';
import SuperAdminLogin from './SuperAdminLogin';
import SuperAdminDashboard from './SuperAdminDashboard';

type Theme = 'dark' | 'light';
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });
export const useSATheme = () => useContext(ThemeCtx);

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('sa-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return getSystemTheme();
}

export default function SuperAdminApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Check real auth session on mount
  useEffect(() => {
    (async () => {
      try {
        const loggedIn = await isSuperAdminLoggedIn();
        setIsLoggedIn(loggedIn);
      } catch {
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Listen for OS theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (!localStorage.getItem('sa-theme')) {
        setTheme(mq.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sa-theme', next);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b', color: '#fafafa' }}>
        Loading...
      </div>
    );
  }

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
