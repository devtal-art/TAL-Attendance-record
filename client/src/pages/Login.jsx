import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// The one account for the Attendance Management module. The username is fixed and shown; only the password is typed.
const USERNAME = 'TAL Admin';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = typeof location.state?.from === 'string' && /^\/(?!\/)/.test(location.state.from) ? location.state.from : '/daily';

  if (loading) return <div className="muted pad">Loading…</div>;
  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(USERNAME, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>Attendance Management</h1>
        <p className="muted">Sign in to open Daily Attendance, Monthly Record and Admin.</p>
        <label>Username
          <input value={USERNAME} readOnly autoComplete="username" className="readonly" />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required maxLength={200} autoComplete="current-password" />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
