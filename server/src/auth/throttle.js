// Brute-force protection for sign-in. Failed attempts are counted per IP address and per username;
// once a limit is reached that key is locked until its 15-minute window ends.
// Kept in memory: fine for one server process, and a restart clears it.

const WINDOW_MS = 15 * 60 * 1000;

class FailureTracker {
  constructor(max) {
    this.max = max;
    this.entries = new Map(); // key -> { count, since }
    setInterval(() => this.sweep(), 5 * 60 * 1000).unref();
  }

  sweep() {
    const now = Date.now();
    for (const [key, e] of this.entries) if (now - e.since > WINDOW_MS) this.entries.delete(key);
  }

  /** Seconds until this key may try again, or 0 if it may. */
  retryAfter(key) {
    const e = this.entries.get(key);
    if (!e) return 0;
    const left = e.since + WINDOW_MS - Date.now();
    if (left <= 0) { this.entries.delete(key); return 0; }
    return e.count >= this.max ? Math.ceil(left / 1000) : 0;
  }

  fail(key) {
    const e = this.entries.get(key);
    if (!e || Date.now() - e.since > WINDOW_MS) this.entries.set(key, { count: 1, since: Date.now() });
    else e.count += 1;
  }

  reset(key) {
    this.entries.delete(key);
  }
}

const byIp = new FailureTracker(Number(process.env.LOGIN_MAX_PER_IP) || 8);
const byUser = new FailureTracker(Number(process.env.LOGIN_MAX_PER_USER) || 10);

export const loginRetryAfter = (ip, username) => Math.max(byIp.retryAfter(ip), byUser.retryAfter(username.toLowerCase()));
export const recordLoginFailure = (ip, username) => { byIp.fail(ip); byUser.fail(username.toLowerCase()); };
export const recordLoginSuccess = (ip, username) => { byIp.reset(ip); byUser.reset(username.toLowerCase()); };
