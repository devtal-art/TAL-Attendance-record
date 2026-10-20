# Attendance Manager (React + Express + MongoDB Atlas)

Attendance is marked **daily**; the **monthly** record (for salary) is built from those daily entries.
The project is two independent apps, deployed separately: `server/` (API) and `client/` (React frontend).

## Two modules
| Module | Sections | Access |
|---|---|---|
| **Attendance Management** | Daily Attendance, Monthly Record, Admin | **Sign-in required** |
| **Employees** | each employee's day-wise register | Open to everyone (the page you land on) |

Sign-in: username **TAL Admin** (fixed, shown on the form), password typed by the user.

## Run (development) - two terminals
1. Create `server/.env` from `server/.env.example` and set `MONGODB_URI` (your Atlas connection string).
   In Atlas, **Network Access** must allow your IP address.
2. **Terminal 1 - backend** (API on http://localhost:5000):
   ```
   cd server
   npm install
   npm start          # or: npm run dev  (restarts on file changes)
   ```
3. **Terminal 2 - frontend** (app on http://localhost:5173):
   ```
   cd client
   npm install
   npm run dev
   ```
In development the frontend proxies `/api` to `localhost:5000`, so nothing else needs configuring.
On the first start an empty database is filled with the default shifts, leave types, settings, employees and the sign-in account.
Development password: `Attendance2026` (only used the first time, to create the account).

Other server commands: `npm run seed` (fill empty collections), `npm run set-password -- "new password"`.

## Deploying (backend and frontend on different platforms)
**1. Backend** (any Node host: Render, Railway, Fly.io, a VPS...). Root directory `server`, build `npm install`, start `npm start`. Environment variables (see `server/.env.example`):
- `MONGODB_URI`, `MONGODB_DB`; in Atlas allow the host's IP in Network Access.
- `NODE_ENV=production`, `ADMIN_PASSWORD` (required the first time, min 10 characters).
- `CLIENT_ORIGIN` = the frontend's exact URL, e.g. `https://attendance.example.com` (no trailing slash).
- `TRUST_PROXY=1` (the host terminates HTTPS in front of the server).
- Cookie mode, by where the two sites live:
  - **Same site** (e.g. `attendance.example.com` + `api.example.com`): keep the default `COOKIE_SAMESITE=strict` and set `COOKIE_SECURE=true`.
  - **Different sites** (e.g. `*.vercel.app` + `*.onrender.com`): set `COOKIE_SAMESITE=none` (forces Secure). Some browsers block third-party cookies, so a shared custom domain for both is the more reliable choice.

**2. Frontend** (any static host: Vercel, Netlify, Cloudflare Pages...). Root directory `client`, build `npm run build`, publish `dist`. Environment variable (set **before** the build, it is baked into the files):
- `VITE_API_URL` = the backend's URL, e.g. `https://api.example.com` (no trailing slash).

The site is a single-page app that uses hash URLs (`/#/employees`, `/#/login`), so any static host works with no rewrite rules and refreshing a page never gives a 404.

**3. Check:** open the frontend URL, you should land on Employees; sign in under Attendance Management. Always use **HTTPS** (the password travels in the sign-in request).

## Security
- **The Atlas connection string is a secret.** It lives only in `server/.env` / the host's environment, never in code or logs. Use a dedicated Atlas database user with access to this database only, and rotate its password if it was ever shared.
- The password is stored only as a salted **scrypt** hash (`admin_users`). Change it with `npm run set-password -- "new password"` (signs everyone out).
- Sign-in sets a random token in an **httpOnly** cookie (not readable by JavaScript, never in localStorage), `SameSite=Strict` by default. The database stores only the token's SHA-256 hash (`sessions`, expired ones removed by a MongoDB TTL index); signing out deletes it. Sessions last `SESSION_HOURS` (8).
- **Every Attendance Management API route is checked on the server** (401 without a session). Hiding screens is not the protection; the API refuses.
- CORS only allows `CLIENT_ORIGIN`; POST / PUT / DELETE from any other Origin are refused (403), which is the CSRF defence when `COOKIE_SAMESITE=none`.
- Repeated wrong passwords lock that IP / username for 15 minutes. Security headers (helmet), no-store caching for the API, 100 kB body limit. Request values are type-checked and ids validated, so query operators in a request body can't reach the database.
- The Employees module uses its own small `/api/public/*` routes that return only what that page shows. Daily entries, the monthly salary summary, Admin and leave allowances are never public.
The login lock is kept in memory (fine for one server process; it resets on restart).

## What lives in the database (so nothing is hard-coded)
| Collection | Purpose |
|---|---|
| `employees` | people: name, employee ID, shift, active, and their leave allowance for each tracked leave |
| `attendance` | one document per employee per day (unique on employee + date) |
| `holidays` | company holidays (date + name) |
| `shifts` | shift name + working weekdays (`workDays`, 0 = Sunday ... 6 = Saturday) |
| `leave_types` | each leave: label, unit (days/hours), hasQuota, defaultAllowance, shown under On Leave / Present, isPaid |
| `settings` | `full_day_minutes` (480), `half_day_minutes` (240), `max_minutes`, `short_leave_hours` (1,2) |
| `admin_users`, `sessions` | the sign-in account (password hash) and active sessions (token hashes) |

Edit `shifts`, `leave_types` or `settings` in the Atlas data browser and the app picks it up within a few seconds (no restart).

## Structure
- `server/src/db.js` - Atlas connection, collections, indexes · `seed.js` - default data · `config.js` - loads shifts/leave types/settings
- `server/src/auth` - password hashing, sessions, login throttle · `middleware/security.js` - `requireAuth`, origin check
- `server/src/routes` - `auth`, `public` (Employees module), and protected `employees`, `attendance`, `holidays`
- `server/src/utils/rules.js` - daily entry rules · `calc.js` - **monthly / payroll rules** (placeholder, edit here)
- `server/src/tools` - `set-password.js`, `import-json.js` (one-time import of the old MySQL export in `server/backup/`)
- `client/src/api.js` - API calls (`VITE_API_URL`) · `auth.jsx`, `pages/Login.jsx`, `components/Layout.jsx` - sign-in and the two-module sidebar
