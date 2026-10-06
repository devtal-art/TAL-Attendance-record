import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDb } from './db.js';
import { loadConfig, refreshConfigIfStale, getConfig } from './config.js';
import { seedLookups, seedEmployeesIfEmpty, seedAdminIfMissing } from './seed.js';
import { requireAuth, originGuard } from './middleware/security.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import employeeRoutes from './routes/employees.js';
import attendanceRoutes from './routes/attendance.js';
import holidayRoutes from './routes/holidays.js';
import { wrap } from './utils/wrap.js';

const app = express();

// Behind a reverse proxy / load balancer (needed for the real client IP and HTTPS detection): TRUST_PROXY=1
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);

app.use(helmet());                                              // security headers
app.use(cors({ origin: allowedOrigins, credentials: true }));   // only the app's own origin(s), with cookies
app.use(express.json({ limit: '100kb' }));
app.use(originGuard(allowedOrigins));                           // CSRF defence for POST / PUT / DELETE
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Shifts, leave types and thresholds live in the database; re-read them every few seconds so edits show up.
app.use('/api', wrap(async (_req, _res, next) => { await refreshConfigIfStale(); next(); }));
app.get('/api/config', (_req, res) => res.json(getConfig()));

// ---- open to everyone: the Employees module ----
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);

// ---- Attendance Management module: signed-in only ----
app.use('/api/employees', requireAuth, employeeRoutes);
app.use('/api/attendance', requireAuth, attendanceRoutes);
app.use('/api/holidays', requireAuth, holidayRoutes);

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ message: err.status === 413 ? 'Request too large' : 'Invalid request' });
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: 'That employee ID is already in use' });
  res.status(500).json({ message: 'Something went wrong' });
});

const port = process.env.PORT || 5000;
try {
  await initDb();
  await seedLookups();
  await loadConfig();
  await seedAdminIfMissing();
  await seedEmployeesIfEmpty();
} catch (err) {
  console.error(`[startup] ${err.friendly || err.message}`);
  if (!err.friendly && !/ADMIN_PASSWORD/.test(err.message)) console.error(err);
  process.exit(1);
}

const server = app.listen(port, () => console.log(`[api] http://localhost:${port}`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`[api] Port ${port} is already in use. Stop the other process or set PORT in server/.env`);
  else console.error(err);
  process.exit(1);
});
