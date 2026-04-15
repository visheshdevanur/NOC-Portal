import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/useAuth';
import Login from './pages/Login';
import UpdatePassword from './pages/UpdatePassword';
import DashboardRouter from './pages/DashboardRouter';
import Layout from './components/layout/Layout';
import { ThemeProvider } from './components/ThemeProvider';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background transition-colors duration-300 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] animate-pulse" style={{ animationDuration: '3s' }} />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/5 blur-[80px] animate-pulse" style={{ animationDuration: '5s' }} />
        
        {/* Logo */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-[hsl(220,100%,50%)] shadow-[0_8px_30px_-6px_rgba(0,75,202,0.4)] dark:shadow-[0_8px_30px_-6px_rgba(59,130,246,0.3)] flex items-center justify-center animate-pulse" style={{ animationDuration: '2s' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight" style={{ fontFamily: 'Manrope, Inter, sans-serif' }}>
            NO DUE PORTAL
          </h1>
          
          {/* Animated dots */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.2s' }} />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1.2s' }} />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1.2s' }} />
          </div>
          
          <p className="text-sm text-muted-foreground font-medium tracking-wide">
            Initializing secure session...
          </p>
        </div>
      </div>
    );
  }

  // Check if user is in the middle of a password reset flow
  const isPasswordResetPending = sessionStorage.getItem('password_reset_pending') === 'true';

  return (
    <ThemeProvider defaultTheme="light" storageKey={`noc-theme-${user ? user.id : 'guest'}`}>
      <BrowserRouter>
        <Routes>
          <Route 
            path="/login" 
            element={!user ? <Login /> : <Navigate to={isPasswordResetPending ? "/update-password" : "/"} />} 
          />
          <Route 
            path="/update-password" 
            element={<UpdatePassword />} 
          />
          
          <Route element={<Layout />}>
            <Route 
              path="/" 
              element={
                user
                  ? (isPasswordResetPending ? <Navigate to="/update-password" /> : <DashboardRouter />)
                  : <Navigate to="/login" />
              } 
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
