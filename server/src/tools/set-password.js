// Change (or create) the sign-in password for the Attendance Management module.
// Usage:  npm run set-password -- "your new password"
// Signs out every existing session.
import 'dotenv/config';
import { initDb, closeDb, C, CI } from '../db.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/password.js';

const password = process.argv[2];
const username = process.env.ADMIN_USERNAME || 'TAL Admin';
if (!password || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Usage: npm run set-password -- "new password"   (at least ${MIN_PASSWORD_LENGTH} characters)`);
  process.exit(1);
}

await initDb();
const passwordHash = await hashPassword(password);
const result = await C.adminUsers.updateOne({ username }, { $set: { passwordHash } }, { collation: CI });
if (!result.matchedCount) await C.adminUsers.insertOne({ username, passwordHash, createdAt: new Date() });
await C.sessions.deleteMany({});
console.log(`[auth] password updated for "${username}"; all sessions signed out`);
await closeDb();
