import { C } from '../db.js';
import { monthEnd } from './mappers.js';

/** date -> holiday name for one 'YYYY-MM' month. Company-wide; weekly offs are per employee, from their shift. */
export async function loadHolidays(month) {
  const rows = await C.holidays.find({ date: { $gte: `${month}-01`, $lte: monthEnd(month) } }).toArray();
  return new Map(rows.map((h) => [h.date, h.name]));
}
