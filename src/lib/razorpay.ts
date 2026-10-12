/**
 * Razorpay — brief §10 "Payments".
 *
 * Two responsibilities, kept apart on purpose:
 *
 *   1. `createRazorpayOrder` — the server tells Razorpay the amount. The
 *      browser never sends one. Everything about the payment flow depends on
 *      that being true, so the amount argument comes from `calculateCart`'s
 *      total and from nowhere else.
 *   2. `verifyWebhookSignature` / `verifyPaymentSignature` — pure functions
 *      over `node:crypto`. These are the only things that may be treated as
 *      proof, and they are pure precisely so they can be unit tested against
 *      known vectors without a network or a database.
 *
 * **No SDK.** The `razorpay` npm package wraps two REST calls and an HMAC, both
 * of which are a few lines here, and CLAUDE.md asks before adding a dependency
 * outside the locked stack. §5 locks "Payments: Razorpay" — the provider, not a
 * client library. This is `fetch` plus `node:crypto`.
 *
 * Amounts: Razorpay's API unit for INR is the paise, which is this codebase's
 * unit too, so no conversion happens anywhere in this file. That is the whole
 * reason to say it out loud — a `* 100` here would be the classic bug.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Paise } from './money';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

/** Razorpay rejects an order below ₹1.00. Worth naming, so a ₹1 test order is obviously legal. */
export const RAZORPAY_MIN_AMOUNT_PAISE = 100;

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RazorpayError';
  }
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

/**
 * The key id is public — it goes to the browser to open Checkout — so it lives
 * in `NEXT_PUBLIC_RAZORPAY_KEY_ID`. The secret never leaves the server.
 */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/** True when online payment can be offered at all. COD does not depend on this. */
export function isRazorpayConfigured(): boolean {
  return razorpayConfig() !== null;
}

export interface CreateRazorpayOrderInput {
  amountPaise: Paise;
  /** Our own order number, so a Razorpay dashboard row can be traced back. Max 40 chars. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amountPaise: Paise;
  currency: string;
  status: string;
}

/**
 * Create the Razorpay order the browser will pay against.
 *
 * `payment_capture` is not sent: Razorpay accounts default to auto-capture, and
 * the webhook is what confirms the order either way. A failure here throws —
 * the caller must not create a local order it cannot collect against.
 */
export async function createRazorpayOrder(
  input: CreateRazorpayOrderInput,
): Promise<RazorpayOrder> {
  const config = razorpayConfig();
  if (!config) {
    throw new RazorpayError('Razorpay is not configured on this deployment.');
  }
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
    throw new RazorpayError(`Amount must be a whole number of paise, at least ₹1.00.`);
  }

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amountPaise, // already paise — never multiply
        currency: 'INR',
        receipt: input.receipt.slice(0, 40),
        notes: input.notes ?? {},
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new RazorpayError('Could not reach Razorpay.', error);
  }

  if (!response.ok) {
    // The body carries Razorpay's own description, which is worth having in
    // Sentry. It is not shown to the customer.
    const detail = await response.text().catch(() => '');
    throw new RazorpayError(`Razorpay rejected the order (${response.status}): ${detail}`);
  }

  const parsed = z.object({
    id: z.string().regex(/^order_[A-Za-z0-9]+$/),
    amount: z.number().int().positive(),
    currency: z.literal('INR'),
    status: z.literal('created'),
  }).safeParse(await response.json());
  if (!parsed.success || parsed.data.amount !== input.amountPaise) {
    throw new RazorpayError('Razorpay returned an invalid or mismatched order.');
  }
  const body = parsed.data;

  return {
    id: body.id,
    amountPaise: body.amount,
    currency: body.currency ?? 'INR',
    status: body.status ?? 'created',
  };
}

/** Constant-time compare of two hex digests. False for any length mismatch. */
function hexEquals(a: string, b: string): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(a) || !/^[a-fA-F0-9]{64}$/.test(b)) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    // Non-hex input — a forged or truncated signature.
    return false;
  }
}

/**
 * Verify a webhook against the **raw** request body.
 *
 * It has to be the raw bytes, not a re-serialised object: `JSON.parse` followed
 * by `JSON.stringify` can reorder keys and drop whitespace, and the digest is
 * over the exact bytes Razorpay signed. The route handler reads `req.text()`
 * before parsing anything, for this reason alone.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined = process.env.RAZORPAY_WEBHOOK_SECRET,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return hexEquals(expected, signature.trim());
}

/**
 * Verify the signature Razorpay Checkout hands the browser on success.
 *
 * This proves the browser is reporting a real payment, but it is **not** what
 * confirms an order — §10 is explicit that only the webhook may change order
 * state. It is used to decide whether to show the customer "payment received,
 * confirming" rather than "payment pending", which is a message, not a state.
 */
export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string | null | undefined,
  keySecret: string | null | undefined = process.env.RAZORPAY_KEY_SECRET,
): boolean {
  if (!signature || !keySecret) return false;
  const expected = createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return hexEquals(expected, signature.trim());
}
