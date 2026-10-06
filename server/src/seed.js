import 'dotenv/config';
import { initDb, closeDb, C } from './db.js';
import { loadConfig } from './config.js';
import { quotaReasons, defaultAllowance } from './utils/rules.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth/password.js';

// ---------------------------------------------------------------------------
// Default data. Only inserted into EMPTY collections, so anything you later edit in the
// database (Atlas) or through the app is never overwritten.
// ---------------------------------------------------------------------------

// workDays: 0 = Sunday ... 6 = Saturday
const SHIFTS = [
  { key: 'shift1', label: 'Shift 1', workDays: [1, 2, 3, 4, 5], sortOrder: 1 },    // Monday to Friday
  { key: 'shift2', label: 'Shift 2', workDays: [6, 0, 1, 2, 3], sortOrder: 2 },    // Saturday to Wednesday
  { key: 'shift3', label: 'Shift 3', workDays: [0, 1, 2, 3, 4], sortOrder: 3 },    // Sunday to Thursday
  { key: 'shift4', label: 'Shift 4', workDays: [1, 2, 3, 4, 5, 6], sortOrder: 4 }, // Monday to Saturday
];

const leave = (key, label, unit, hasQuota, defaultAllowance, onLeave, withPresent, isShortLeave, isPaid, sortOrder) =>
  ({ key, label, unit, hasQuota, defaultAllowance, onLeave, withPresent, isShortLeave, isPaid, sortOrder });

const LEAVE_TYPES = [
  leave('earned_leave', 'Earned Leave', 'days', true, 5, true, true, false, true, 1),
  leave('sick_leave', 'Sick Leave', 'days', true, 5, true, true, false, true, 2),
  leave('casual_leave', 'Casual Leave', 'days', true, 5, true, true, false, true, 3),
  leave('unpaid_leave', 'Unpaid Leave', 'days', false, 0, true, true, false, false, 4),  // no quota, not paid
  leave('relaxation', 'Relaxation', 'days', false, 0, true, true, false, true, 5),       // no quota
  leave('holiday', 'Holiday', 'days', false, 0, true, false, false, true, 6),            // no quota, On Leave only
  leave('comp_off', 'Comp Off', 'days', true, 5, true, true, false, true, 7),
  leave('short_leave', 'Short Leave', 'hours', true, 10, false, true, true, true, 8),    // hourly, Present only
];

const SETTINGS = [
  { _id: 'full_day_minutes', value: '480' },   // 8 hours: a full working day
  { _id: 'half_day_minutes', value: '240' },   // 4 hours: minimum for a half-day leave with Present
  { _id: 'max_minutes', value: '1440' },       // 24 hours: upper limit for one day's total time
  { _id: 'short_leave_hours', value: '1,2' },  // hours a Short Leave can be taken for
];

// Employee list from the original sheet. Blank IDs stay blank until HR assigns them.
const EMPLOYEES = [
  ['TALF01', 'Gurpreet Saigal'], ['TALF02', 'Jasmeet Kaur'], ['TALF03', 'Nitin Modgil'], ['TALF11', 'Neeraj Kumar'],
  ['TALF08', 'Jaswinder Singh'], ['TALC24', 'Shashwat Sharma'], ['TALC16', 'Harjeet Kaur'], ['TALF04', 'Naveen Adhikari'],
  ['TALF10', 'Kavish Jain'], ['TALC21', 'Navjot Tiwari'], ['', 'Tanya'], ['TALC17', 'Vishal Kumar'], ['TALF15', 'Lakshay'],
  ['TALF17', 'Gourisha Narang'], ['TALC11', 'Komala Keerthi'], ['', 'Ravinder'], ['TALC20', 'Alpa Thakur'],
  ['TALC22', 'Sehbaz Singh'], ['TALC14', 'Sahil'], ['TALC12', 'Shubham Panwar'], ['', 'Gagan'], ['', 'Pratham'],
  ['', 'Sonu'], ['', 'Saawan'],
];

// Shifts from the shift sheet. Anyone not listed here is Shift 1 (Mon-Fri).
const SHIFT_BY_NAME = {
  'Shashwat Sharma': 'shift2', 'Harjeet Kaur': 'shift2', 'Navjot Tiwari': 'shift2', 'Vishal Kumar': 'shift2', // Sat-Wed
  Lakshay: 'shift3',                                                                                           // Sun-Thu
  Sonu: 'shift4',                                                                                              // Mon-Sat
};

const isEmpty = async (collection) => (await collection.countDocuments({}, { limit: 1 })) === 0;

/** shifts, leave_types and settings: the collections the rules read at runtime. */
export async function seedLookups() {
  if (await isEmpty(C.shifts)) await C.shifts.insertMany(SHIFTS);
  if (await isEmpty(C.leaveTypes)) await C.leaveTypes.insertMany(LEAVE_TYPES);
  if (await isEmpty(C.settings)) await C.settings.insertMany(SETTINGS);
}

/**
 * Creates the one sign-in account for the Attendance Management module, if there isn't one yet.
 * Username: ADMIN_USERNAME (default "TAL Admin"). Password: ADMIN_PASSWORD.
 * In development the password defaults to "Attendance2026" so it works out of the box; in production
 * ADMIN_PASSWORD must be set. Only a salted hash is stored. Change it later with: npm run set-password
 */
export async function seedAdminIfMissing() {
  if (!(await isEmpty(C.adminUsers))) return false;
  const username = process.env.ADMIN_USERNAME || 'TAL Admin';
  let password = process.env.ADMIN_PASSWORD;
  const usingDefault = !password;
  if (usingDefault) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_PASSWORD must be set (server/.env or the environment) before the first start in production.');
    }
    password = 'Attendance2026'; // development default only
  }
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  await C.adminUsers.insertOne({ username, passwordHash: await hashPassword(password), createdAt: new Date() });
  console.log(`[auth] created sign-in account "${username}"${usingDefault ? ' with the development default password' : ''}`);
  return true;
}

/** Only on a brand-new database. An existing one (or a data import) is left alone. */
export async function seedEmployeesIfEmpty() {
  if (!(await isEmpty(C.employees))) return false;
  const now = new Date();
  const allowance = () => Object.fromEntries(quotaReasons().map((r) => [r, defaultAllowance(r)]));
  await C.employees.insertMany(EMPLOYEES.map(([code, name]) => ({
    ...(code ? { employeeCode: code } : {}),
    name,
    active: true,
    shift: SHIFT_BY_NAME[name] || 'shift1',
    leaveAllowance: allowance(),
    createdAt: now,
    updatedAt: now,
  })));
  console.log(`[seed] created ${EMPLOYEES.length} employees`);
  return true;
}

// `npm run seed` -> fills any empty collection with the defaults above.
if (process.argv[1]?.endsWith('seed.js')) {
  await initDb();
  await seedLookups();
  await loadConfig();
  await seedAdminIfMissing();
  if (!(await seedEmployeesIfEmpty())) console.log('[seed] database already has employees, nothing to do');
  await closeDb();
  process.exit(0);
}
