import { createHash } from 'node:crypto';

/*
  Backing off after Shiprocket refuses a login.

  A wrong password used to be retried on every rate quote, order push and
  tracking read — each a fresh login — until Shiprocket answered "User blocked
  due to too many failed login attempts" (12 October 2026). A blocked API user
  stops shipping for everyone, and only Shiprocket can lift it.

  So a refused login is remembered, and no further login is attempted until the
  pause has passed or the credentials have changed. Pure — no database, no
  `server-only` — so the rule can be tested without a network.
*/

/** How long a refused login is left alone before one more attempt is made. */
export const LOGIN_BACKOFF_MS = 30 * 60 * 1000;

/** What a refused login leaves behind, in memory and in the `Setting` table. */
export interface LoginBlock {
  fingerprint: string;
  until: number;
}

/**
 * Identifies a pair of credentials without storing either. A corrected
 * password changes it, so the fix is tried at once rather than after the pause.
 */
export function credentialFingerprint(email: string, password: string): string {
  return createHash('sha256').update(`${email}\n${password}`).digest('hex').slice(0, 16);
}

/**
 * Only a 4xx means Shiprocket looked at the credentials and said no. A 5xx or
 * a timeout says nothing about them, and backing off there would turn a
 * minute's outage into half an hour without live rates.
 */
export function isLoginRefusal(status: number): boolean {
  return status >= 400 && status < 500;
}

/** True while these same credentials are still inside their pause. */
export function isLoginBlocked(block: unknown, fingerprint: string, now: number): boolean {
  if (typeof block !== 'object' || block === null) return false;
  const { fingerprint: blocked, until } = block as Partial<LoginBlock>;
  return blocked === fingerprint && typeof until === 'number' && until > now;
}
