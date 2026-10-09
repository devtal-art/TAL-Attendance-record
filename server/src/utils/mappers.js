// Database documents -> the JSON shapes the client already uses (`_id` as a string).

export const employeeJson = (d) => ({
  _id: String(d._id),
  name: d.name,
  employeeId: d.employeeCode || undefined,
  designation: d.designation || undefined,
  department: d.department || undefined,
  active: d.active !== false,
  shift: d.shift,
});

export const recordJson = (d) => ({
  _id: String(d._id),
  employee: String(d.employeeId),
  date: d.date,
  status: d.status,
  totalMinutes: d.totalMinutes ?? 0,
  reason: d.reason ?? null,
  shortLeaveHours: d.shortLeaveHours ?? null,
  leaveDays: Number(d.leaveDays ?? 0),
});

export const holidayJson = (d) => ({ _id: String(d._id), date: d.date, name: d.name });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** true only for real calendar dates ('2026-02-31' is rejected). */
export const isRealDate = (s) => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Last day of a 'YYYY-MM' month as 'YYYY-MM-DD'. Dates are stored as plain strings, so a month is a string range. */
export const monthEnd = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};
