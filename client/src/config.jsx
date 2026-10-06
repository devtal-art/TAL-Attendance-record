import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

// Shifts, leave types and thresholds (8h / 4h / short-leave hours) come from the database via /api/config,
// so the screens never hard-code a leave name or a shift.
const Ctx = createContext(null);
export const useConfig = () => useContext(Ctx);

function derive(cfg) {
  const byKey = Object.fromEntries(cfg.leaveTypes.map((t) => [t.key, t]));
  const hourly = (key) => byKey[key]?.unit === 'hours';
  return {
    ...cfg,
    shiftOf: (key) => cfg.shifts.find((s) => s.key === key) || cfg.shifts[0] || { key, label: key, days: '' },
    reasonLabel: (key) => byKey[key]?.label || key,
    // On Leave: every leave marked on_leave. Present (under a full day): short leave first, then the rest.
    leaveReasons: cfg.leaveTypes.filter((t) => t.onLeave).map((t) => t.key),
    presentReasons: cfg.leaveTypes.filter((t) => t.withPresent).sort((a, b) => Number(b.isShortLeave) - Number(a.isShortLeave)).map((t) => t.key),
    quotaReasons: cfg.leaveTypes.filter((t) => t.hasQuota).map((t) => t.key),
    shortLeaveKey: cfg.leaveTypes.find((t) => t.isShortLeave)?.key,
    shortLeaveHours: cfg.settings.shortLeaveHours,
    fullDayMinutes: cfg.settings.fullDayMinutes,
    isHourly: hourly,
    unitOf: (key) => (hourly(key) ? 'hrs' : 'days'),
  };
}

export function ConfigProvider({ children }) {
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/config').then(setCfg).catch((e) => setError(e.message));
  }, []);

  const value = useMemo(() => (cfg ? derive(cfg) : null), [cfg]);

  if (error) return <div className="center"><div className="error">Could not load settings from the server: {error}. Is the API running (and MySQL started in XAMPP)?</div></div>;
  if (!value) return <div className="center muted">Loading…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
