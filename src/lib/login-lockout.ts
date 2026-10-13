import 'server-only';
import { db } from '@/lib/db';

/**
 * Staff sign-in lockout, kept in Postgres.
 *
 * `checkRateLimit` is the first throttle, but it allows everything when
 * Upstash is not configured or unreachable. A password guess against a staff
 * account must not depend on that, so the count lives on the `User` row: five
 * wrong passwords in a row pause sign-in for that account for fifteen minutes,
 * and a correct password during the pause is refused too.
 *
 * The cost is that someone who knows a staff address can keep it paused. That
 * is the lesser harm, and `pnpm user:create` clears a pause.
 */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_SECONDS = 15 * 60;

export function isLockedOut(lockedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

/** Counts one wrong password, and starts the pause on the fifth. */
export async function recordFailedLogin(userId: string): Promise<void> {
  // The increment is one statement, so two guesses at once cannot both read
  // the same count and slip under the limit.
  const { failedLoginCount } = await db.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });

  if (failedLoginCount >= MAX_FAILED_LOGINS) {
    await db.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: new Date(Date.now() + LOCKOUT_SECONDS * 1000),
      },
    });
  }
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
