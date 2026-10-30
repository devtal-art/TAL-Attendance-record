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
  ['present relaxed', 'P', 'Relaxation / relaxation too (dark border)'],
];

const RELAXATION = 'relaxation'; // leave key of management's relaxation

/**
 * @param r   the day's attendance record (or undefined)
 * @param o   { type: 'week_off' | 'holiday', name } when the day is the employee's week off or a company holiday
 * @param cfg client config (for leave labels and whether a leave is paid)
 * @returns { kind, code, tip, cls }  kind = tag colour, code = text in the tag, tip = hover text,
 *          cls = full class list for the tag (adds the relaxation border and the worked-on-a-day-off ring)
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
    ? [STATUS[r.status].label, r.reason && cfg.reasonLabel(r.reason), r.shortLeaveHours && `${r.shortLeaveHours}h`, r.half && (r.half === 'first' ? 'First half' : 'Second half'), r.relaxationMinutes && `${r.relaxationMinutes}m relaxed`, o && `(${o.name})`].filter(Boolean).join(' · ')
    : o ? o.name : '';
  // Relaxation as the reason, or another leave with "Relaxation too" (it has relaxation time).
  const relaxed = r && (r.reason === RELAXATION || r.relaxationMinutes > 0);
  const cls = ['tag', kind, relaxed && 'relaxed', r && o && 'on-off'].filter(Boolean).join(' ');
  return { kind, code, tip, cls };
}
