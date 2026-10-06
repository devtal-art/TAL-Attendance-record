// One-time import of the old MySQL data (backup/mysql-export-*.json) into MongoDB Atlas.
// Usage:  node src/tools/import-json.js [file.json] [--replace]
//   (no file)  -> newest backup/mysql-export-*.json
//   --replace  -> first clears the app's collections (use if the database already holds data)
// The sign-in password hash is copied as-is, so the same password keeps working.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { initDb, closeDb, C } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const replace = args.includes('--replace');
let file = args.find((a) => !a.startsWith('--'));
if (!file) {
  const dir = path.resolve(here, '../../backup');
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^mysql-export-.*\.json$/.test(f)).sort() : [];
  if (!found.length) { console.error('No backup/mysql-export-*.json found.'); process.exit(1); }
  file = path.join(dir, found[found.length - 1]);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`[import] reading ${file}`);

await initDb();

const existing = await C.employees.countDocuments({}, { limit: 1 });
if (existing && !replace) {
  console.error('[import] the employees collection already has data. Re-run with --replace to clear and import again.');
  await closeDb();
  process.exit(1);
}
if (replace) {
  for (const c of [C.attendance, C.employees, C.holidays, C.shifts, C.leaveTypes, C.settings, C.adminUsers, C.sessions]) await c.deleteMany({});
}

// MySQL gave timestamps as 'YYYY-MM-DD HH:MM:SS' in this machine's local time
const when = (s) => (s ? new Date(String(s).replace(' ', 'T')) : new Date());
const bool = (v) => v === 1 || v === true;

await C.shifts.insertMany(data.shifts.map((s) => ({
  key: s.shift_key, label: s.label, workDays: String(s.work_days).split(',').map(Number), sortOrder: s.sort_order,
})));
await C.leaveTypes.insertMany(data.leave_types.map((t) => ({
  key: t.leave_key, label: t.label, unit: t.unit, hasQuota: bool(t.has_quota), defaultAllowance: Number(t.default_allowance),
  onLeave: bool(t.on_leave), withPresent: bool(t.with_present), isShortLeave: bool(t.is_short_leave), isPaid: bool(t.is_paid), sortOrder: t.sort_order,
})));
await C.settings.insertMany(data.settings.map((s) => ({ _id: s.setting_key, value: s.setting_value })));

// employees, with their leave allowances now stored on the employee; old numeric id -> new ObjectId
const allowanceOf = new Map();
for (const a of data.employee_leave_allowance) {
  if (!allowanceOf.has(a.employee_id)) allowanceOf.set(a.employee_id, {});
  allowanceOf.get(a.employee_id)[a.leave_key] = Number(a.allowed);
}
const idMap = new Map();
const employees = data.employees.map((e) => {
  const _id = new ObjectId();
  idMap.set(e.id, _id);
  return {
    _id,
    ...(e.employee_code ? { employeeCode: e.employee_code } : {}),
    name: e.name,
    ...(e.designation ? { designation: e.designation } : {}),
    active: bool(e.active),
    shift: e.shift_key,
    leaveAllowance: allowanceOf.get(e.id) || {},
    createdAt: when(e.created_at),
    updatedAt: when(e.updated_at),
  };
});
await C.employees.insertMany(employees);

let skipped = 0;
const attendance = [];
for (const a of data.attendance) {
  const employeeId = idMap.get(a.employee_id);
  if (!employeeId) { skipped++; continue; }
  attendance.push({
    employeeId, date: a.date, status: a.status, totalMinutes: a.total_minutes, reason: a.reason ?? null,
    shortLeaveHours: a.short_leave_hours ?? null, leaveDays: Number(a.leave_days), createdAt: when(a.created_at), updatedAt: when(a.updated_at),
  });
}
if (attendance.length) await C.attendance.insertMany(attendance);

if (data.holidays.length) await C.holidays.insertMany(data.holidays.map((h) => ({ date: h.date, name: h.name })));
if (data.admin_users.length) {
  await C.adminUsers.insertMany(data.admin_users.map((u) => ({ username: u.username, passwordHash: u.password_hash, createdAt: when(u.created_at) })));
}

console.log(`[import] shifts ${data.shifts.length}, leave types ${data.leave_types.length}, settings ${data.settings.length}, `
  + `employees ${employees.length}, attendance ${attendance.length}${skipped ? ` (skipped ${skipped})` : ''}, `
  + `holidays ${data.holidays.length}, sign-in accounts ${data.admin_users.length}`);
await closeDb();
