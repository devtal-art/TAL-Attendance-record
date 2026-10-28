// The Employees module is open to everyone, so it gets its own small routes that return only what that page shows.
// Everything else (daily entry, monthly salary summary, admin, allowances) is behind sign-in.
import { Router } from 'express';
import { C, oid } from '../db.js';
import { wrap } from '../utils/wrap.js';
import { getMonthMeta, summarize } from '../utils/calc.js';
import { recordJson, monthEnd } from '../utils/mappers.js';
import { loadHolidays } from '../utils/holidays.js';
import { weekOffDays } from '../utils/rules.js';
import { loadWeekOffOverrides } from '../utils/weekoffs.js';

const router = Router();
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const publicEmployee = (e) => ({ _id: String(e._id), name: e.name, employeeId: e.employeeCode || undefined });
const publicRecord = (r) => ({
  status: r.status, reason: r.reason, leaveDays: r.leaveDays, shortLeaveHours: r.shortLeaveHours, totalMinutes: r.totalMinutes, half: r.half,
});

// All active employees with the few numbers shown in the collapsed accordion row.
router.get('/employees', wrap(async (req, res) => {
  const month = String(req.query.month ?? '');
  if (!MONTH_RE.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });
  const [holidays, employees, records, extraOffs] = await Promise.all([
    loadHolidays(month),
    C.employees.find({ active: true }, { collation: { locale: 'en', strength: 2 } }).sort({ name: 1 }).toArray(),
    C.attendance.find({ date: { $gte: `${month}-01`, $lte: monthEnd(month) } }).toArray(),
    loadWeekOffOverrides(month),
  ]);
  const byEmp = new Map();
  for (const r of records) {
    const k = String(r.employeeId);
    if (!byEmp.has(k)) byEmp.set(k, []);
    byEmp.get(k).push(recordJson(r));
  }
  res.json({
    rows: employees.map((e) => {
      const recs = byEmp.get(String(e._id)) || [];
      const summary = summarize(recs, getMonthMeta(month, holidays, weekOffDays(e.shift), extraOffs.get(String(e._id))), { eightHourPolicy: e.eightHourPolicy !== false });
      return {
        employee: publicEmployee(e),
        shift: e.shift,
        department: e.department || undefined,
        summary: { daysWorked: summary.daysWorked, payableDays: summary.payableDays, overtimeMinutes: summary.overtimeMinutes },
        leavesTaken: recs.reduce((sum, r) => sum + r.leaveDays, 0), // full + half-day leaves (not hourly short leave)
      };
    }),
  });
}));

// One employee's day-wise register for the month.
router.get('/employees/:id/register', wrap(async (req, res) => {
  const month = String(req.query.month ?? '');
  if (!MONTH_RE.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });
  const id = oid(req.params.id);
  const employee = id && (await C.employees.findOne({ _id: id, active: true }));
  if (!employee) return res.status(404).json({ message: 'Employee not found' });

  const [holidays, rows, extraOffs] = await Promise.all([
    loadHolidays(month),
    C.attendance.find({ employeeId: id, date: { $gte: `${month}-01`, $lte: monthEnd(month) } }).toArray(),
    loadWeekOffOverrides(month),
  ]);
  const byDate = new Map(rows.map((r) => [r.date, recordJson(r)]));
  const own = getMonthMeta(month, holidays, weekOffDays(employee.shift), extraOffs.get(String(id)));
  res.json({
    employee: { ...publicEmployee(employee), shift: employee.shift, eightHourPolicy: employee.eightHourPolicy !== false },
    days: own.days.map((d) => ({
      date: d.date, day: d.day, dow: d.dow,
      off: d.off ? { type: d.offType, name: d.off } : null,
      record: byDate.has(d.date) ? publicRecord(byDate.get(d.date)) : null,
    })),
  });
}));

export default router;
