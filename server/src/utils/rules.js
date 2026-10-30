// ---------------------------------------------------------------------------
// Daily attendance entry rules (validation + derived fields), shifts and leave helpers.
// The values these rules use (shifts, leave types, 8h / 4h thresholds, short-leave hours) come
// from the database through config.js, so nothing here is hard-coded to a particular leave name.
// The client mirrors the enable/disable behaviour, but THIS file is the authority: nothing is
// saved unless it passes buildRecord().
// ---------------------------------------------------------------------------
import { getConfig } from '../config.js';

const types = () => getConfig().leaveTypes;
const typeOf = (key) => types().find((t) => t.key === key);
const hours = (minutes) => `${+(minutes / 60).toFixed(2)} hour${minutes === 60 ? '' : 's'}`;

// ---- leave types -----------------------------------------------------------
/** Reasons selectable when status is On Leave. */
export const leaveReasons = () => types().filter((t) => t.onLeave).map((t) => t.key);
/** Reasons selectable when status is Present and less than a full day was worked. */
export const presentReasons = () => types().filter((t) => t.withPresent).map((t) => t.key);
/** Reasons that have an allowance and are tracked as used / left. */
export const quotaReasons = () => types().filter((t) => t.hasQuota).map((t) => t.key);
export const shortLeaveKey = () => types().find((t) => t.isShortLeave)?.key;
export const isUnpaidReason = (key) => !!typeOf(key) && !typeOf(key).isPaid;
export const labelOf = (key) => typeOf(key)?.label || key;
export const unitOf = (key) => (typeOf(key)?.unit === 'hours' ? 'hour(s)' : 'day(s)');
export const defaultAllowance = (key) => typeOf(key)?.defaultAllowance ?? 0;

const RELAXATION_KEY = 'relaxation';
const HALVES = ['first', 'second']; // which half of the day a leave taken with Present covers

const fail = (error) => ({ error });

/**
 * @param {{status:string,totalMinutes?:number,reason?:string,shortLeaveHours?:number}} input
 * @returns {{error:string}|{value:{status,totalMinutes,reason,shortLeaveHours,leaveDays}}}
 *   leaveDays = how much of the day is deducted from the employee's leave record (0, 0.5 or 1).
 * @param {{weekOff?: boolean}} [opts]  weekOff: this date is the employee's week off (their shift's off day).
 *   Working on a week off is all overtime, so Present needs only a time - no 8-hour minimum, no leave reason.
 *   eightHourPolicy: false (employee setting) drops the 8-hour rules for Present the same way.
 */
export function buildRecord({ status, totalMinutes, reason, shortLeaveHours, half, relaxationMinutes }, { weekOff = false, eightHourPolicy = true } = {}) {
  const { fullDayMinutes, halfDayMinutes, maxMinutes, shortLeaveHours: allowedHours } = getConfig().settings;
  const base = { status, totalMinutes: 0, reason: null, shortLeaveHours: null, leaveDays: 0, half: null, relaxationMinutes: null };

  if (status === 'absent') return { value: base };

  // Partially available: no reason, no minimum or full-day rule on the time (optional); counted as an unpaid day (see calc.js).
  if (status === 'p_available') {
    const mins = totalMinutes === undefined || totalMinutes === null || totalMinutes === '' ? 0 : Number(totalMinutes);
    if (!Number.isInteger(mins) || mins < 0) return fail('Enter a valid total time.');
    if (mins > maxMinutes) return fail(`Total time can't be more than ${hours(maxMinutes)}.`);
    return { value: { ...base, totalMinutes: mins } };
  }

  if (status === 'on_leave') {
    if (!leaveReasons().includes(reason)) return fail('Select a reason for the leave.');
    return { value: { ...base, reason, leaveDays: 1 } };
  }

  if (status === 'present') {
    const mins = Number(totalMinutes);
    if (!Number.isInteger(mins) || mins <= 0) return fail('Enter the total time worked.');
    if (mins > maxMinutes) return fail(`Total time can't be more than ${hours(maxMinutes)}.`);

    // Employee without the 8-hour policy: whatever time is entered is saved, no leave reason needed.
    if (!eightHourPolicy || weekOff || mins >= fullDayMinutes) return { value: { ...base, totalMinutes: mins } };

    // Less than a full day: a leave reason is mandatory.
    const short = typeOf(shortLeaveKey());
    if (!reason) {
      return fail(`Less than ${hours(fullDayMinutes)} worked. Select ${short ? short.label : 'a leave'} or another leave as the reason.`);
    }
    if (!presentReasons().includes(reason)) return fail(`${labelOf(reason)} can't be used with Present.`);

    // Relaxation time (the time management relaxed) can come with any leave taken with Present ("Relaxation too"),
    // and counts toward the time that leave needs.
    const relax = relaxationMinutes === undefined || relaxationMinutes === null || relaxationMinutes === '' ? 0 : Number(relaxationMinutes);
    if (!Number.isInteger(relax) || relax < 0 || relax > fullDayMinutes) return fail(`Relaxation time must be between 0 and ${hours(fullDayMinutes)}.`);
    if (relax > 0) base.relaxationMinutes = relax;

    // Relaxation as the reason: worked time + relaxation reaching a full day counts as a full day.
    if (reason === RELAXATION_KEY && relax > 0 && mins + relax >= fullDayMinutes) return { value: { ...base, totalMinutes: mins, reason } };

    if (!HALVES.includes(half)) return fail('Select whether the leave is for the first half or the second half of the day.');

    if (reason === shortLeaveKey()) {
      const hrs = Number(shortLeaveHours);
      if (!allowedHours.includes(hrs)) return fail(`Select ${allowedHours.join(' or ')} hours for the short leave.`);
      if (mins + hrs * 60 + relax < fullDayMinutes) {
        return fail(`Time worked plus short leave${relax ? ' plus relaxation' : ''} must be at least ${hours(fullDayMinutes)}.`);
      }
      return { value: { ...base, totalMinutes: mins, reason, shortLeaveHours: hrs, half } };
    }

    // Any other leave on a working day = half-day leave. Relaxation has no minimum: whatever total time is entered is saved.
    if (reason !== RELAXATION_KEY && mins + relax < halfDayMinutes) {
      return fail(`A leave with Present needs at least ${hours(halfDayMinutes)} worked${relax ? ' (including relaxation)' : ''} (it counts as a half day).`);
    }
    return { value: { ...base, totalMinutes: mins, reason, leaveDays: 0.5, half } };
  }

  return fail('Select a status.');
}

/** How much of the allowance a saved record uses: { reason, amount }, or null (no reason, or a leave without a quota). */
export function usageOf(value) {
  const t = typeOf(value.reason);
  if (!t || !t.hasQuota) return null;
  const amount = t.isShortLeave ? value.shortLeaveHours : value.leaveDays;
  return amount ? { reason: value.reason, amount } : null;
}

// ---- shifts ----------------------------------------------------------------
// workDays use JS weekday numbers (0 = Sunday ... 6 = Saturday); every other day is that
// employee's weekly off. Admin can move an employee to any shift.
const shifts = () => getConfig().shifts;
export const shiftKeys = () => shifts().map((s) => s.key);
export const isValidShift = (key) => shiftKeys().includes(key);
export const defaultShift = () => shifts()[0]?.key;

export const weekOffDays = (shiftKey) => {
  const shift = shifts().find((s) => s.key === shiftKey) || shifts()[0];
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !shift?.workDays.includes(d));
};

/** Weekday (0-6) of a 'YYYY-MM-DD' string, independent of the server's timezone. */
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const isWeekOff = (shiftKey, date) => weekOffDays(shiftKey).includes(weekdayOf(date));
