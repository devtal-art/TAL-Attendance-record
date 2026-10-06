import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// Two modules:
//   Attendance Management - needs sign-in; its three sections appear under it once you are signed in
//   Employees             - open to everyone, and the page you land on
const MANAGEMENT = [['/daily', 'Daily Attendance'], ['/monthly', 'Monthly Record'], ['/admin', 'Admin']];

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const LockIcon = () => <Svg><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
const ChevronIcon = ({ open }) => <span className={`nav-chevron ${open ? 'open' : ''}`}><Svg><path d="M9 6l6 6-6 6" /></Svg></span>;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inManagement = pathname === '/login' || MANAGEMENT.some(([to]) => pathname.startsWith(to));
  const [expanded, setExpanded] = useState(true);

  // Arriving in the module (or signing in) opens its group.
  useEffect(() => { if (user && inManagement) setExpanded(true); }, [user, inManagement]);

  // Signed out: the group is a door to the sign-in screen. Signed in: it opens and closes.
  const onGroupClick = () => (user ? setExpanded((e) => !e) : navigate('/login'));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Attendance</div>
        <nav>
          <div className="nav-group">
            <button className={`nav-head ${inManagement ? 'active' : ''}`} onClick={onGroupClick} aria-expanded={!!user && expanded}>
              <span>Attendance Management</span>
              {user ? <ChevronIcon open={expanded} /> : <LockIcon />}
            </button>
            {user && expanded && (
              <div className="nav-sub">
                {MANAGEMENT.map(([to, label]) => (
                  <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
                ))}
              </div>
            )}
          </div>

          <NavLink to="/employees" className={({ isActive }) => (isActive ? 'active' : '')}>Employees</NavLink>
        </nav>

        {user && (
          <div className="me">
            <div className="muted small">Signed in as</div>
            <div className="me-name">{user.username}</div>
            <button className="link" onClick={async () => { await logout(); navigate('/employees'); }}>Sign out</button>
          </div>
        )}
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
