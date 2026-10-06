// Where the API lives. Empty (the default) means "same origin": in development Vite proxies /api to the server.
// When the frontend and the backend are deployed on different hosts, set VITE_API_URL (e.g. https://api.example.com)
// when building the client. The sign-in session is an httpOnly cookie, so the browser attaches it by itself and no
// token ever lives in JavaScript or localStorage.
const BASE = `${String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api`;

async function request(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    credentials: 'include', // send the session cookie, also to an API on another origin (the server's CORS allows it)
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The session ended (expired, signed out elsewhere): let the app drop back to the sign-in screen.
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('auth-expired'));
    const error = new Error(data.message || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body || {}),
  del: (url) => request('DELETE', url),
};
