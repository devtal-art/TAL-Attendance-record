import { findSession } from '../auth/sessions.js';
import { wrap } from '../utils/wrap.js';

/** Routes behind this need a valid signed-in session (the Attendance Management module). */
export const requireAuth = wrap(async (req, res, next) => {
  const session = await findSession(req);
  if (!session) return res.status(401).json({ message: 'Please sign in to continue.' });
  req.admin = { id: session.admin_id, username: session.username };
  next();
});

/**
 * Extra CSRF defence on top of SameSite=Strict cookies: a state-changing request that carries an
 * Origin header must come from the app itself (CLIENT_ORIGIN, or the same host that is serving the API).
 */
export function originGuard(allowedOrigins) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      let ok = allowedOrigins.includes(origin);
      if (!ok) {
        try { ok = new URL(origin).host === req.headers.host; } catch { ok = false; }
      }
      if (!ok) return res.status(403).json({ message: 'Origin not allowed.' });
    }
    next();
  };
}
