/**
 * Who may look at an order, without a login.
 *
 * Brief §12 Phase 6 wants "customer tracking via order number + phone, no
 * login", and Phase 5 needs the same thing one step earlier: the confirmation
 * page a customer lands on straight after paying. Order numbers are sequential
 * — `BB-2627-00001` — so the order number alone can never be the credential.
 *
 * Two ways in, and no others:
 *
 *   1. A **capability token** in the URL, minted at the moment the order is
 *      placed. An HMAC of the order number under `AUTH_SECRET`, so it is
 *      unforgeable without the secret and needs no table to store.
 *   2. The **full mobile number** on the order. Ten digits, checked in constant
 *      time. Not the last four: even with the rate limit below, four digits
 *      against a sequential order number is a few thousand guesses. Ten is
 *      not. `unlockOrder` (`src/server/actions/order-access.ts`) rate-limits
 *      by the submitted phone number — the real attack this credential faces
 *      isn't guessing someone's phone number, it's the reverse: holding a
 *      known number and walking every order number against it, since the
 *      numbers are sequential and gapless.
 *
 * The token deliberately does not expire. It is a link a customer keeps in
 * their browser history and their WhatsApp thread, and an order they can still
 * see next month is the point. It grants read-only access to one order number.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 16; // 128 bits, hex-encoded — plenty for a capability URL.

class OrderAccessError extends Error {}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    // Every deployment already needs this for Auth.js; failing loudly is right.
    throw new OrderAccessError('AUTH_SECRET is not set, so order links cannot be signed.');
  }
  return value;
}

/** The token that goes in the confirmation URL. */
export function orderAccessToken(orderNumber: string): string {
  return createHmac('sha256', secret())
    .update(`order-access:${orderNumber.trim().toUpperCase()}`)
    .digest('hex')
    .slice(0, TOKEN_BYTES * 2);
}

/** True when `token` was minted for this order number. Constant time. */
export function isValidOrderToken(orderNumber: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = orderAccessToken(orderNumber);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

/** Bare ten digits, however the number was typed. */
export function normalisePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

/**
 * Constant-time comparison of a submitted phone number against the one on the
 * order. Both are normalised first, so `+91 98470 12345` matches `9847012345`.
 */
export function phoneMatches(
  submitted: string,
  onOrder: string | null | undefined,
): boolean {
  if (!onOrder) return false;
  const a = normalisePhone(submitted);
  const b = normalisePhone(onOrder);
  if (a.length !== 10 || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
