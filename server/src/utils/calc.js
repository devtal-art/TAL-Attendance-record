// ---------------------------------------------------------------------------
// MONTHLY / PAYROLL LOGIC LIVES HERE.
// Everything below is a simple placeholder so the monthly numbers have values.
// Replace these two functions when the real salary rules are decided; no other file
// needs to change.
// ---------------------------------------------------------------------------

import { isUnpaidReason } from './rules.js';
import { getConfig } from '../config.js';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Describes a month: each day, which days are off, and the month-level totals.
 * @param {string} month  'YYYY-MM'
 * @param {Map<string,string>} holidays  date -> holiday name (from the Holiday collection)
 * @param {number[]} weekOffDays  weekdays (0 = Sunday) that are this employee's weekly off, from their shift
 */
export function getMonthMeta(month, holidays = new Map(), weekOffDays = []) {
  const [y, m] = month.split('-').map(Number);
  const totalDays = new Date(y, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= totalDays; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const dow = new Date(y, m - 1, d).getDay();
    let off = null;
    let offType = null;
    if (holidays.has(date)) { off = holidays.get(date); offType = 'holiday'; }
    else if (weekOffDays.includes(dow)) { off = 'Week Off'; offType = 'week_off'; }
    days.push({ date, day: d, dow, off, offType });
  }
  const weekOffs = days.filter((d) => d.offType === 'week_off').length;
  const holidayCount = days.filter((d) => d.offType === 'holiday').length;
  return { month, totalDays, weekOffs, holidays: holidayCount, workingDays: totalDays - weekOffs - holidayCount, days };
}

/**
 * Turns an employee's daily records for the month into salary-ready numbers.
 * Each record has: status, reason, leaveDays (0 / 0.5 / 1), shortLeaveHours, totalMinutes.
 */
export function summarize(records, meta, { eightHourPolicy = true } = {}) {
  let daysWorked = 0;
  let paidLeaves = 0;
  let unpaidLeaves = 0;
  let overtimeMinutes = 0;
  const { fullDayMinutes } = getConfig().settings;
  const weekOffDates = new Set(meta.days.filter((d) => d.offType === 'week_off').map((d) => d.date));

  for (const r of records) {
    // Worked on the employee's week off: the whole time is overtime, and the day is not a worked / payable day.
    if (r.status === 'present' && weekOffDates.has(r.date)) {
      overtimeMinutes += r.totalMinutes || 0;
      continue;
    }
    const unpaid = isUnpaidReason(r.reason); // leave_types.is_paid = 0 (PLACEHOLDER: every other leave is paid)
    if (r.status === 'present') {
      // Overtime: whatever was worked beyond a full day.
      if (eightHourPolicy && (r.totalMinutes || 0) > fullDayMinutes) overtimeMinutes += r.totalMinutes - fullDayMinutes;
      daysWorked += 1 - (r.leaveDays || 0);
      if (unpaid) unpaidLeaves += r.leaveDays || 0; // half-day unpaid leave -> 0.5 deducted
      else paidLeaves += r.leaveDays || 0;
    } else if (r.status === 'on_leave') {
      if (unpaid) unpaidLeaves += 1;
      else paidLeaves += 1;
    } else if (r.status === 'absent' || r.status === 'p_available') { // P Available is an unpaid day
      unpaidLeaves += 1;
    }
  }

  // Payable days = days worked + paid leaves (days that are not deduction days).
  // Week offs are NOT counted. A company holiday is counted only if nothing was marked that day
  // (a holiday that was worked or taken as leave is already in the numbers above).
  const recordedDates = new Set(records.map((r) => r.date));
  const paidHolidays = meta.days.filter((d) => d.offType === 'holiday' && !recordedDates.has(d.date)).length;

  // Absent and Unpaid Leave days are fully deduction days (the employee is not paid for them).
  return {
    daysWorked,
    paidLeaves,
    unpaidLeaves,
    overtimeMinutes,
    payableDays: Math.min(meta.totalDays, daysWorked + paidLeaves + paidHolidays),
    deductionDays: unpaidLeaves,
  };
}
