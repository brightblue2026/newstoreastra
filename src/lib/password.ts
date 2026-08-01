import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Staff password hashing.
 *
 * scrypt from Node's standard library rather than bcrypt or argon2 — it is a
 * memory-hard KDF on OWASP's recommended list, and it keeps a native
 * dependency out of a build that has to run on Vercel. Customers never have a
 * password at all; they sign in by phone OTP.
 *
 * Parameters are OWASP's minimum for scrypt (N=2^17, r=8, p=1), roughly 128 MB
 * of memory per hash. Staff logins are rare enough that the cost is invisible.
 */
const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

/**
 * Hashes a password into a self-describing string:
 * `scrypt$N$r$p$<salt-base64>$<hash-base64>`
 *
 * The parameters travel with the hash, so they can be raised later without
 * invalidating existing passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string.');
  }

  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT_PARAMS);

  const { N, r, p } = SCRYPT_PARAMS;
  return [PREFIX, N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * Verifies a password against a stored hash. Returns false rather than
 * throwing on a malformed hash, so a corrupt row denies access instead of
 * crashing the login route.
 *
 * The comparison is constant-time.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Guard against a tampered row asking for an unbounded amount of memory.
  if (N > 2 ** 20 || r > 32 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
