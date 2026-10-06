import dns from 'node:dns';
import { MongoClient, ObjectId } from 'mongodb';

// MongoDB Atlas. The connection string is a secret: it lives in server/.env (git-ignored) as MONGODB_URI
// and is never written into code, logs or error messages.
let client;
let database;

const col = (name) => database.collection(name);

/** The collections the app uses. */
export const C = {
  get shifts() { return col('shifts'); },
  get leaveTypes() { return col('leave_types'); },
  get settings() { return col('settings'); },
  get employees() { return col('employees'); },
  get attendance() { return col('attendance'); },
  get holidays() { return col('holidays'); },
  get adminUsers() { return col('admin_users'); },
  get sessions() { return col('sessions'); },
};

/** Case-insensitive matching for the sign-in username ("tal admin" finds "TAL Admin"). */
export const CI = { locale: 'en', strength: 2 };

/** A request value -> ObjectId, or null when it isn't a well-formed id. Always safe to pass user input. */
export const oid = (value) => (/^[0-9a-fA-F]{24}$/.test(String(value)) ? new ObjectId(String(value)) : null);

async function connect(uri) {
  const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 15000, appName: 'attendance-platform' });
  await mongo.connect();
  return mongo;
}

const friendly = (err) => {
  err.friendly = 'Could not connect to MongoDB Atlas. Check MONGODB_URI in server/.env, that this machine\'s IP address is allowed '
    + 'in Atlas (Network Access), and that the cluster is running.';
  return err;
};

export async function initDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw Object.assign(new Error('MONGODB_URI is not set'), { friendly: 'MONGODB_URI is not set. Add it to server/.env (see .env.example).' });

  // Some routers / VPNs refuse the DNS SRV lookup that mongodb+srv:// needs. DNS servers can be forced with
  // MONGODB_DNS_SERVERS, and if that lookup fails we automatically retry once through public DNS.
  if (process.env.MONGODB_DNS_SERVERS) dns.setServers(process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  try {
    client = await connect(uri);
  } catch (err) {
    if (!/querySrv|ECONNREFUSED|ENOTFOUND|ETIMEOUT/.test(String(err.message)) || !uri.startsWith('mongodb+srv')) throw friendly(err);
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    try { client = await connect(uri); } catch (retryErr) { throw friendly(retryErr); }
  }

  database = client.db(process.env.MONGODB_DB || 'attendance_record');
  await database.command({ ping: 1 });
  await ensureIndexes();
  console.log(`[db] connected to MongoDB Atlas, database "${database.databaseName}"`);
}

export const closeDb = () => client?.close();

// Created on startup if missing. These replace the keys and constraints the SQL tables used to have.
async function ensureIndexes() {
  await Promise.all([
    C.shifts.createIndex({ key: 1 }, { unique: true }),
    C.leaveTypes.createIndex({ key: 1 }, { unique: true }),
    // employee IDs are unique, but several employees may have none yet
    C.employees.createIndex({ employeeCode: 1 }, { unique: true, partialFilterExpression: { employeeCode: { $type: 'string' } } }),
    C.employees.createIndex({ name: 1 }),
    C.attendance.createIndex({ employeeId: 1, date: 1 }, { unique: true }),   // one record per employee per day
    C.attendance.createIndex({ date: 1 }),
    C.holidays.createIndex({ date: 1 }, { unique: true }),
    C.adminUsers.createIndex({ username: 1 }, { unique: true, collation: CI }),
    C.sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    C.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),     // MongoDB deletes expired sessions itself
  ]);
}
