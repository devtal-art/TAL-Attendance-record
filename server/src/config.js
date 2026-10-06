import { C } from './db.js';

// Everything the rules and the client need to know about shifts, leave types and thresholds comes
// from the database (collections shifts, leave_types, settings) and is served to the client as /api/config.

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** [6,0,1,2,3] -> "Sat – Wed" (handles ranges that wrap around the week). */
export function daysLabel(workDays) {
  const set = new Set(workDays);
  if (set.size === 7) return 'Every day';
  if (!set.size) return 'No working days';
  const runs = [];
  for (let d = 0; d < 7; d++) {
    if (set.has(d) && !set.has((d + 6) % 7)) {
      let len = 1;
      while (set.has((d + len) % 7)) len++;
      runs.push(len === 1 ? DOW[d] : `${DOW[d]} – ${DOW[(d + len - 1) % 7]}`);
    }
  }
  return runs.join(', ');
}

let cache = null;
let loadedAt = 0;
const MAX_AGE_MS = 5000; // pick up edits made directly in the database within a few seconds

export async function loadConfig() {
  const [shifts, types, settings] = await Promise.all([
    C.shifts.find().sort({ sortOrder: 1, key: 1 }).toArray(),
    C.leaveTypes.find().sort({ sortOrder: 1, key: 1 }).toArray(),
    C.settings.find().toArray(),
  ]);
  const s = Object.fromEntries(settings.map((r) => [r._id, r.value]));
  const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

  cache = {
    statuses: ['present', 'absent', 'on_leave'],
    shifts: shifts.map((r) => {
      const workDays = (r.workDays || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      return { key: r.key, label: r.label, workDays, days: daysLabel(workDays) };
    }),
    leaveTypes: types.map((r) => ({
      key: r.key,
      label: r.label,
      unit: r.unit,
      hasQuota: !!r.hasQuota,
      defaultAllowance: Number(r.defaultAllowance) || 0,
      onLeave: !!r.onLeave,
      withPresent: !!r.withPresent,
      isShortLeave: !!r.isShortLeave,
      isPaid: r.isPaid !== false,
    })),
    settings: {
      fullDayMinutes: num(s.full_day_minutes, 480),
      halfDayMinutes: num(s.half_day_minutes, 240),
      maxMinutes: num(s.max_minutes, 1440),
      shortLeaveHours: String(s.short_leave_hours || '1,2').split(',').map(Number).filter((n) => n > 0),
    },
  };
  loadedAt = Date.now();
  return cache;
}

export async function refreshConfigIfStale() {
  if (!cache || Date.now() - loadedAt > MAX_AGE_MS) await loadConfig();
}

export function getConfig() {
  if (!cache) throw new Error('Config not loaded yet');
  return cache;
}
