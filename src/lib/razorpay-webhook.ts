/**
 * Razorpay webhook verification and idempotency — prep work for §12 Phase 5,
 * which isn't built yet (no Razorpay account exists this session). Same
 * pattern as `pricing.ts` and `cod.ts`: the pure logic is built and tested
 * now, wiring it to a live route waits for real credentials.
 *
 * Two separate concerns on purpose:
 *
 * 1. **Signature verification** — proves a webhook request actually came
 *    from Razorpay, not an attacker who guessed the endpoint URL. Every
 *    payment-state change (an order moving to CONFIRMED, inventory
 *    decrementing) must be gated on this passing, or anyone who finds the
 *    webhook URL can mark their own unpaid order as paid.
 * 2. **Idempotency** — Razorpay retries a webhook delivery on timeout or a
 *    non-2xx response, so the same event can arrive more than once. Replaying
 *    it must never double-decrement inventory or double-send a confirmation
 *    email. This module only derives a stable key to dedupe on; enforcing
 *    uniqueness (a DB unique constraint on that key, checked before
 *    processing) is the caller's job once an `Order`/`PaymentEvent` table
 *    exists to check it against.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies the `X-Razorpay-Signature` header against the raw request body.
 *
 * Razorpay's scheme: HMAC-SHA256 of the exact raw bytes Razorpay sent, using
 * the webhook secret configured in the Razorpay dashboard, hex-encoded. The
 * comparison must be constant-time — a timing side-channel on signature
 * comparison is a real attack (the same reason `lib/password.ts` compares
 * hashes with `timingSafeEqual` rather than `===`).
 *
 * `rawBody` must be the untouched request body string. Parsing it to JSON
 * and re-serialising before verifying is a common mistake that breaks
 * verification the moment key order or whitespace differs from what
 * Razorpay actually sent.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  webhookSecret: string,
): boolean {
  if (!signature || !webhookSecret) return false;

  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');

  // Different-length buffers would throw inside timingSafeEqual rather than
  // safely report a mismatch — an attacker sending a malformed signature
  // must not be able to crash the handler.
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    order?: { entity?: { id?: string } };
  };
}

/**
 * A stable key to dedupe repeat deliveries of the same event on the same
 * payment/order. Not itself a uniqueness guarantee — see the module doc.
 */
export function webhookIdempotencyKey(payload: RazorpayWebhookPayload): string {
  const paymentId = payload.payload?.payment?.entity?.id;
  const orderId = payload.payload?.payment?.entity?.order_id ?? payload.payload?.order?.entity?.id;
  return `${payload.event}:${paymentId ?? orderId ?? 'unknown'}`;
}
