import { Router } from 'express';
import { C, oid } from '../db.js';
import { wrap } from '../utils/wrap.js';
import { getMonthMeta, summarize } from '../utils/calc.js';
import { usedMap, balancesFor } from '../utils/balance.js';
import { employeeJson, recordJson, isRealDate, monthEnd } from '../utils/mappers.js';
import { buildRecord, usageOf, labelOf, unitOf, isWeekOff, weekOffDays } from '../utils/rules.js';
import { loadHolidays } from '../utils/holidays.js';

const router = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const BY_NAME = { collation: { locale: 'en', strength: 2 } };

// ---- One day, all employees -------------------------------------------------
router.get('/daily', wrap(async (req, res) => {
  const { date } = req.query;
  if (!isRealDate(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
  const [employees, records, holiday, used] = await Promise.all([
    C.employees.find({ active: true }, BY_NAME).sort({ name: 1 }).toArray(),
    C.attendance.find({ date }).toArray(),
    C.holidays.findOne({ date }),
    usedMap(),
  ]);
  const byEmp = new Map(records.map((r) => [String(r.employeeId), recordJson(r)]));
  res.json({
    date,
    holiday: holiday?.name || null,
    items: employees.map((e) => ({
      employee: employeeJson(e),
      record: byEmp.get(String(e._id)) || null,
      weekOff: !holiday && isWeekOff(e.shift, date), // this date is outside the employee's shift (a holiday takes precedence)
      balances: balancesFor(e.leaveAllowance, used.get(String(e._id))),
    })),
  });
}));

// Create/update (or clear, when status is empty) one employee's record for one day.
// All rules are enforced by buildRecord(); a broken rule comes back as a 400 with a readable message.
router.put('/daily', wrap(async (req, res) => {
  const { employee: employeeId, date, status, totalMinutes, reason, shortLeaveHours, half } = req.body || {};
  if (!isRealDate(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
  const id = oid(employeeId);
  const employee = id && (await C.employees.findOne({ _id: id }));
  if (!employee) return res.status(404).json({ message: 'Employee not found' });

  // Leave used on every OTHER day, so re-saving this day isn't counted against itself.
  const usedElsewhere = (await usedMap({ employee: id, excludeDate: date })).get(String(id)) || {};

  let record = null;
  if (!status) {
    await C.attendance.deleteOne({ employeeId: id, date });
  } else {
    const onHoliday = await C.holidays.findOne({ date }, { projection: { _id: 1 } });
    const weekOff = !onHoliday && isWeekOff(employee.shift, date);
    const result = buildRecord({ status, totalMinutes, reason, shortLeaveHours, half }, { weekOff, eightHourPolicy: employee.eightHourPolicy !== false });
    if (result.error) return res.status(400).json({ message: result.error });
    const v = result.value;

    // The leave must fit inside what the employee has left.
    const usage = usageOf(v);
    if (usage) {
      const left = balancesFor(employee.leaveAllowance, usedElsewhere)[usage.reason].left;
      if (usage.amount > left) {
        return res.status(400).json({
          message: `${labelOf(usage.reason)}: only ${Math.max(left, 0)} ${unitOf(usage.reason)} left, but this entry needs ${usage.amount}.`,
        });
      }
    }
    const now = new Date();
    const saved = await C.attendance.findOneAndUpdate(
      { employeeId: id, date },
      {
        $set: { status: v.status, totalMinutes: v.totalMinutes, reason: v.reason, shortLeaveHours: v.shortLeaveHours, leaveDays: v.leaveDays, half: v.half, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after' }
    );
    record = recordJson(saved);
  }

  const used = (await usedMap({ employee: id })).get(String(id));
  res.json({ record, balances: balancesFor(employee.leaveAllowance, used) });
}));

// ---- Whole month, all employees ---------------------------------------------
// Week offs depend on each employee's shift, so month totals and off days are worked out per row.
// `meta` (shared) only carries the calendar and company holidays.
router.get('/monthly', wrap(async (req, res) => {
  const month = String(req.query.month ?? '');
  if (!MONTH_RE.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });
  const [holidays, employees, records] = await Promise.all([
    loadHolidays(month),
    C.employees.find({ active: true }, BY_NAME).sort({ name: 1 }).toArray(),
    C.attendance.find({ date: { $gte: `${month}-01`, $lte: monthEnd(month) } }).toArray(),
  ]);
  const byEmp = new Map();
  for (const r of records) {
    const k = String(r.employeeId);
    if (!byEmp.has(k)) byEmp.set(k, []);
    byEmp.get(k).push(recordJson(r));
  }
  res.json({
    meta: getMonthMeta(month, holidays),
    rows: employees.map((e) => {
      const recs = byEmp.get(String(e._id)) || [];
      const own = getMonthMeta(month, holidays, weekOffDays(e.shift));
      return {
        employee: employeeJson(e),
        shift: e.shift,
        month: { totalDays: own.totalDays, workingDays: own.workingDays, weekOffs: own.weekOffs, holidays: own.holidays },
        off: Object.fromEntries(own.days.filter((d) => d.off).map((d) => [d.date, { type: d.offType, name: d.off }])),
        summary: summarize(recs, own, { eightHourPolicy: e.eightHourPolicy !== false }),
        days: Object.fromEntries(recs.map((r) => [r.date, { status: r.status, reason: r.reason, leaveDays: r.leaveDays, shortLeaveHours: r.shortLeaveHours, totalMinutes: r.totalMinutes, half: r.half }])),
      };
    }),
  });
}));

export default router;
