const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const thisMonth = () => todayISO().slice(0, 7);
export const addMonths = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const prettyDate = (s) =>
  parseISO(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const prettyMonth = (m) =>
  parseISO(`${m}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export const fmtNum = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
export const fmtHM = (min) => `${Math.floor((min || 0) / 60)}h ${pad((min || 0) % 60)}m`;
export const fmtCompact = (min) => (min ? (min % 60 ? `${Math.floor(min / 60)}:${pad(min % 60)}` : `${min / 60}h`) : '');
export const fmtMinutes = (min) => (min ? `${Math.floor(min / 60)}h ${pad(min % 60)}m` : '—');

// Only the three statuses are fixed (the rules depend on them). Leave types, shifts and the 8h / 4h
// thresholds are loaded from the database - see config.jsx.
export const STATUS = {
  present: { label: 'Present', cls: 'present' },
  absent: { label: 'Absent', cls: 'absent' },
  on_leave: { label: 'On Leave', cls: 'paid' },
};
export const STATUS_KEYS = Object.keys(STATUS);

export const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

export const DEPARTMENTS = ['Admin', 'Management', 'Development', 'Design', 'Chat Support', 'HR', 'Accounts', 'House Keeping'];
export const NO_DEPARTMENT = '__none__';

/** Does an employee pass the department / shift filters ('' = all)? */
export const matchesGroup = (department, shift, deptFilter, shiftFilter, defaultShift) =>
  (!deptFilter || (deptFilter === NO_DEPARTMENT ? !department : department === deptFilter)) &&
  (!shiftFilter || (shift || defaultShift) === shiftFilter);
