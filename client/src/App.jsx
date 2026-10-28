import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Daily from './pages/Daily.jsx';
import Monthly from './pages/Monthly.jsx';
import Calendar from './pages/Calendar.jsx';
import Admin from './pages/Admin.jsx';
import Employees from './pages/Employees.jsx';

// Attendance Management pages need a signed-in session; without one the visitor is sent to the sign-in screen
// and brought back here afterwards. (The server enforces this too: the screens only hide, the API refuses.)
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="muted pad">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Employees module: open to everyone, and what you land on */}
        <Route index element={<Navigate to="/employees" replace />} />
        <Route path="employees" element={<Employees />} />

        {/* Attendance Management module: sign-in required */}
        <Route path="login" element={<Login />} />
        <Route path="daily" element={<RequireAuth><Daily /></RequireAuth>} />
        <Route path="monthly" element={<RequireAuth><Monthly /></RequireAuth>} />
        <Route path="calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth><Admin /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/employees" replace />} />
    </Routes>
  );
}
