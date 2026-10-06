import crypto from 'node:crypto';
import { C } from '../db.js';

export const COOKIE_NAME = 'tal_session';
const sessionHours = () => Number(process.env.SESSION_HOURS) || 8;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// SameSite=strict (default): the cookie is never sent on cross-site requests - the safest, and right when the
// frontend and API share a site (same host, or sub-domains of one domain such as app.example.com + api.example.com).
// SameSite=none: needed when the frontend and API are on DIFFERENT sites (e.g. app.vercel.app + api.onrender.com).
// Browsers only accept it with Secure (HTTPS), so it is forced on. The Origin check in middleware/security.js and the
// CORS allow-list (CLIENT_ORIGIN) then act as the CSRF defence.
const sameSite = () => {
  const v = String(process.env.COOKIE_SAMESITE || 'strict').toLowerCase();
  return ['strict', 'lax', 'none'].includes(v) ? v : 'strict';
};

// Secure cookies when the request is HTTPS (set TRUST_PROXY=1 behind a TLS-terminating proxy so Express knows),
// always when COOKIE_SECURE=true, and always for SameSite=none.
const isSecure = (req) => req.secure || process.env.COOKIE_SECURE === 'true' || sameSite() === 'none';

const cookieOptions = (req) => ({
  httpOnly: true,            // not readable from JavaScript, so XSS cannot steal it
  sameSite: sameSite(),
  secure: isSecure(req),
  path: '/',
});

/** Creates a session and returns the random token that goes into the cookie. */
export async function createSession(adminId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await C.sessions.deleteMany({ expiresAt: { $lte: new Date(now) } });
  await C.sessions.insertOne({
    tokenHash: sha256(token),                              // only the hash is stored, so a leaked database can't sign anyone in
    adminId,
    createdAt: new Date(now),
    expiresAt: new Date(now + sessionHours() * 3600 * 1000), // MongoDB's TTL index also removes it after this
    ip: String(req.ip || '').slice(0, 64),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
  });
  return token;
}

export const setSessionCookie = (res, req, token) =>
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: sessionHours() * 3600 * 1000 });

export const clearSessionCookie = (res, req) => res.clearCookie(COOKIE_NAME, cookieOptions(req));

export function readToken(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE_NAME) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** The signed-in admin for this request, or null (no cookie, unknown token or expired session). */
export async function findSession(req) {
  const token = readToken(req);
  if (!token || token.length > 200) return null;
  // The TTL monitor only runs about once a minute, so expiry is checked here as well.
  const session = await C.sessions.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const admin = await C.adminUsers.findOne({ _id: session.adminId });
  return admin ? { session_id: session._id, admin_id: admin._id, username: admin.username } : null;
}

export async function destroySession(req) {
  const token = readToken(req);
  if (token) await C.sessions.deleteOne({ tokenHash: sha256(token) });
}
