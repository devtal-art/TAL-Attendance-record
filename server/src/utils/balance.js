import { C } from '../db.js';
import { quotaReasons, shortLeaveKey, defaultAllowance } from './rules.js';

/**
 * Leave used so far, from the daily records (all time, no reset). Short Leave is counted in hours,
 * everything else in leave days. Returns Map(employeeId string -> { reason: used }).
 * `employee` (an ObjectId) limits it to one person; `excludeDate` leaves one day out, so a day that is
 * being re-saved isn't counted against itself.
 */
export async function usedMap({ employee, excludeDate } = {}) {
  const quota = quotaReasons();
  const map = new Map();
  if (!quota.length) return map;

  const match = { reason: { $in: quota } };
  if (employee) match.employeeId = employee;
  if (excludeDate) match.date = { $ne: excludeDate };

  const rows = await C.attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: { employee: '$employeeId', reason: '$reason' },
        used: { $sum: { $cond: [{ $eq: ['$reason', shortLeaveKey() || ''] }, { $ifNull: ['$shortLeaveHours', 0] }, { $ifNull: ['$leaveDays', 0] }] } },
      },
    },
  ]).toArray();

  for (const r of rows) {
    const k = String(r._id.employee);
    if (!map.has(k)) map.set(k, {});
    map.get(k)[r._id.reason] = Number(r.used);
  }
  return map;
}

/**
 * { reason: { allowed, used, left } } for one employee. `allowance` is the employee's own leaveAllowance object;
 * a leave without a stored allowance uses the default from leave_types.
 */
export function balancesFor(allowance = {}, used = {}) {
  return Object.fromEntries(quotaReasons().map((r) => {
    const allowed = allowance?.[r] ?? defaultAllowance(r);
    const u = used[r] || 0;
    return [r, { allowed, used: u, left: allowed - u }];
  }));
}
