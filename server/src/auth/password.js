import crypto from 'node:crypto';
import { promisify } from 'node:util';

// Passwords are stored as salted scrypt hashes (Node built-in, memory-hard): scrypt$N$r$p$salt$hash.
// The cost parameters are stored with the hash, so they can be raised later without breaking old hashes.
const scrypt = promisify(crypto.scrypt);
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024; // scrypt with N = 2^15, r = 8 needs ~33 MB

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algorithm, n, r, p, saltB64, keyB64] = String(stored).split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEMORY,
    });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Verified against when the username does not exist, so "unknown user" and "wrong password"
// take the same time and cannot be told apart.
let dummy;
export const dummyHash = () => (dummy ||= hashPassword(crypto.randomBytes(16).toString('hex')));
