import { C } from '../db.js';
import { monthEnd } from './mappers.js';

// Day-type overrides the admin set for one employee on one date, on top of the weekly off from their shift:
// off = true makes the date a week off, off = false makes it a working day (even if the shift says week off).
// Stored as one document per employee + date in the `weekoff_overrides` collection (a missing `off` means true).

/** employeeId (string) -> Map of 'YYYY-MM-DD' -> off (boolean), for one 'YYYY-MM' month. */
export async function loadWeekOffOverrides(month) {
  const rows = await C.weekOffOverrides.find({ date: { $gte: `${month}-01`, $lte: monthEnd(month) } }).toArray();
  const byEmp = new Map();
  for (const r of rows) {
    const k = String(r.employeeId);
    if (!byEmp.has(k)) byEmp.set(k, new Map());
    byEmp.get(k).set(r.date, r.off !== false);
  }
  return byEmp;
}

/** employeeId (string) -> off (boolean) for everyone with an override on one date. */
export async function loadWeekOffOverridesOn(date) {
  const rows = await C.weekOffOverrides.find({ date }).toArray();
  return new Map(rows.map((r) => [String(r.employeeId), r.off !== false]));
}
