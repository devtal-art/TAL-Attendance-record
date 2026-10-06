import { Router } from 'express';
import { C, CI } from '../db.js';
import { wrap } from '../utils/wrap.js';
import { verifyPassword, dummyHash } from '../auth/password.js';
import { createSession, setSessionCookie, clearSessionCookie, findSession, destroySession } from '../auth/sessions.js';
import { loginRetryAfter, recordLoginFailure, recordLoginSuccess } from '../auth/throttle.js';

const router = Router();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.post('/login', wrap(async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password || username.length > 64 || password.length > 200) {
    return res.status(400).json({ message: 'Enter your password.' });
  }

  const ip = req.ip || 'unknown';
  const wait = loginRetryAfter(ip, username);
  if (wait) {
    res.set('Retry-After', String(wait));
    return res.status(429).json({ message: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
  }

  const admin = await C.adminUsers.findOne({ username }, { collation: CI });
  // Always run one password check, so a wrong username and a wrong password take the same time.
  const ok = await verifyPassword(password, admin ? admin.passwordHash : await dummyHash());
  if (!admin || !ok) {
    recordLoginFailure(ip, username);
    await sleep(300);
    return res.status(401).json({ message: 'Incorrect username or password.' });
  }

  recordLoginSuccess(ip, username);
  setSessionCookie(res, req, await createSession(admin._id, req));
  res.json({ user: { username: admin.username } });
}));

// Who is signed in? Never an error: { user: null } when nobody is.
router.get('/me', wrap(async (req, res) => {
  const session = await findSession(req);
  res.json({ user: session ? { username: session.username } : null });
}));

router.post('/logout', wrap(async (req, res) => {
  await destroySession(req);
  clearSessionCookie(res, req);
  res.json({ ok: true });
}));

export default router;
