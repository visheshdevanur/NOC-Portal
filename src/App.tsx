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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
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
