import { STATUS } from '../utils.js';

// The coloured tag used by every day-wise register (Monthly Record and the Employees page).
// kind = colour of the tag (see .tag.* in styles.css)
export const LEGEND = [
  ['present', 'P', 'Present'],
  ['half', 'P½', 'Present, half-day leave'],
  ['paid', 'L', 'On Leave (paid)'],
  ['unpaid', 'L', 'On Leave (unpaid)'],
  ['unpaid', 'PA', 'P Available (unpaid)'],
  ['absent', 'A', 'Absent'],
  ['wo', 'WO', 'Week Off'],
  ['holiday', 'H', 'Holiday'],
];

/**
 * @param r   the day's attendance record (or undefined)
 * @param o   { type: 'week_off' | 'holiday', name } when the day is the employee's week off or a company holiday
 * @param cfg client config (for leave labels and whether a leave is paid)
 * @returns { kind, code, tip }  kind = tag colour, code = text in the tag, tip = hover text
 */
export function dayTag(r, o, cfg) {
  const half = r?.status === 'present' && r.leaveDays === 0.5;
  const unpaidLeave = r?.status === 'on_leave' && cfg.leaveTypes.some((t) => t.key === r.reason && !t.isPaid);
  const kind = r
    ? (r.status === 'present' ? (half ? 'half' : 'present') : r.status === 'on_leave' ? (unpaidLeave ? 'unpaid' : 'paid') : r.status === 'p_available' ? 'unpaid' : 'absent')
    : o ? (o.type === 'holiday' ? 'holiday' : 'wo') : null;
  const code = r
    ? (r.status === 'present' ? (half ? 'P½' : 'P') : r.status === 'on_leave' ? 'L' : r.status === 'p_available' ? 'PA' : 'A')
    : o ? (o.type === 'holiday' ? 'H' : 'WO') : '';
  const tip = r
    ? [STATUS[r.status].label, r.reason && cfg.reasonLabel(r.reason), r.shortLeaveHours && `${r.shortLeaveHours}h`, r.half && (r.half === 'first' ? 'First half' : 'Second half'), o && `(${o.name})`].filter(Boolean).join(' · ')
    : o ? o.name : '';
  return { kind, code, tip };
}
