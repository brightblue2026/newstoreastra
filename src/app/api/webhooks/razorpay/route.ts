import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderStatus, PaymentStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { transitionOrder } from '@/lib/orders';
import { notifyOrderEvent } from '@/lib/notifications';
import { autoPushOrder } from '@/lib/shiprocket-fulfilment';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

/*
  POST /api/webhooks/razorpay — brief §10:

    "Server creates the Razorpay Order with the authoritative amount. The browser
     never sends an amount. On success the browser shows *pending* — it does not
     mark the order paid. POST /api/webhooks/razorpay verifies the HMAC-SHA256
     signature against the raw body, then transitions to CONFIRMED and PAID,
     idempotent by razorpayPaymentId."

  This is the *only* thing in the codebase that can confirm a payment.
  `transitionOrder`'s actor is `'WEBHOOK'`, and the state machine in
  `order-status.ts` allows PENDING_PAYMENT → CONFIRMED for no other actor — so
  the guarantee does not rest on this file being the only caller.

  Three properties, in order of importance:

  1. **Raw body.** `req.text()` before any parsing. The digest is over the exact
     bytes Razorpay signed; re-serialising a parsed object can reorder keys and
     would fail a signature that is in fact valid.
  2. **Fail closed.** No signature, no secret configured, or a mismatch → 400 and
     nothing happens. An unconfigured deployment confirms nothing.
  3. **Idempotent.** Razorpay retries, and a retry must change nothing. The
     `razorpayPaymentId` is matched first, and an order already past
     PENDING_PAYMENT is acknowledged without touching stock — replaying a
     webhook must not decrement inventory twice.

  Always 200 once a real event has been recorded or recognised as already
  handled, so Razorpay stops retrying. A 500 is reserved for "we could not
  process this and want it again".
*/

export const runtime = 'nodejs'; // node:crypto and Prisma, not the edge.
export const dynamic = 'force-dynamic';

/** Events worth acting on. Everything else is acknowledged and ignored. */
const PAID_EVENTS = new Set(['payment.captured', 'payment.authorized', 'order.paid']);
const FAILED_EVENTS = new Set(['payment.failed']);

const razorpayWebhookSchema = z.object({
  event: z.string().optional(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z
            .object({
              id: z.string().optional(),
              order_id: z.string().optional(),
              status: z.string().optional(),
              error_description: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      order: z
        .object({
          entity: z.object({ id: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  // A coarse ceiling per source IP, ahead of the signature check below — this
  // is not the idempotency mechanism (that is `transitionOrder`'s row lock),
  // it only stops raw volume from spending compute on HMAC verification for
  // every request. Razorpay's own delivery rate is nowhere near this limit.
  const ip = clientIpFrom(request.headers);
  const withinLimit = await checkRateLimit('webhook-razorpay', ip, 60, 60);
  if (!withinLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Never say which part failed — a probe learns nothing from this.
    console.warn('[razorpay] rejected a webhook with an invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }

  const parsed = razorpayWebhookSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.warn('[razorpay] signed webhook did not match the expected shape:', parsed.error.message);
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }
  const body = parsed.data;

  const event = body.event ?? '';
  const payment = body.payload?.payment?.entity;
  const razorpayOrderId = payment?.order_id ?? body.payload?.order?.entity?.id ?? null;
  const razorpayPaymentId = payment?.id ?? null;

  if (!PAID_EVENTS.has(event) && !FAILED_EVENTS.has(event)) {
    return NextResponse.json({ received: true, ignored: event });
  }

  if (!razorpayOrderId) {
    console.warn('[razorpay] a signed', event, 'carried no order id');
    return NextResponse.json({ received: true, ignored: 'no order id' });
  }

  try {
    /*
      Idempotency, in two layers.

      First by payment id: a retry of an event already recorded finds the order
      and returns without doing anything, because its status is no longer
      PENDING_PAYMENT. Then by order state: `transitionOrder` treats a move to
      the status an order is already in as a no-op, so stock is never
      decremented twice even if two different events for the same payment
      arrive.
    */
    const order = await db.order.findFirst({
      where: razorpayPaymentId
        ? { OR: [{ razorpayPaymentId }, { razorpayOrderId }] }
        : { razorpayOrderId },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true },
    });

    if (!order) {
      // A payment for an order this database has never seen. Acknowledged so
      // Razorpay stops retrying, and logged loudly because it should not happen.
      console.error('[razorpay] no order matches', razorpayOrderId);
      return NextResponse.json({ received: true, ignored: 'unknown order' });
    }

    if (FAILED_EVENTS.has(event)) {
      // A failed attempt is not a cancelled order — the customer can try again
      // on the same order. Only the payment status moves.
      if (order.status === OrderStatus.PENDING_PAYMENT) {
        await db.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: PaymentStatus.FAILED,
            ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
          },
        });
      }
      return NextResponse.json({ received: true, order: order.orderNumber, status: 'failed' });
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      // Already handled — the replay case, and the whole point of this check.
      return NextResponse.json({
        received: true,
        order: order.orderNumber,
        status: 'already handled',
      });
    }

    const result = await transitionOrder({
      orderId: order.id,
      to: OrderStatus.CONFIRMED,
      actor: 'WEBHOOK',
      paymentStatus: PaymentStatus.PAID,
      ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
    });

    if (!result.ok) {
      console.error('[razorpay] could not confirm', order.orderNumber, result.error);
      // Our problem, not Razorpay's — ask for the event again.
      return NextResponse.json({ error: 'Could not confirm the order' }, { status: 500 });
    }

    /*
      The confirmation email and WhatsApp go out only now, after the transition
      has committed — never inside it. A payment that Razorpay has captured
      must not be rolled back because Resend timed out, and a customer must
      never be told an order is confirmed by a transaction that then failed.

      `notifyOrderEvent` swallows its own failures, so this cannot turn a
      successful confirmation into a 500 that makes Razorpay retry. Handed to
      `after()` rather than awaited: the order is already confirmed by this
      point, so Razorpay's own retry/timeout budget shouldn't be spent waiting
      on SMS + PDF render + email, and `after()` (unlike a bare unawaited
      promise) keeps running after the response is sent rather than risking
      being killed when the serverless function freezes.
    */
    after(() => notifyOrderEvent({ orderId: order.id, event: 'CONFIRMED' }));
    // Paid, so it can go to the courier. Here — never on the thank-you page,
    // which a customer can close before it loads. Never throws.
    after(() => autoPushOrder(order.id));

    console.info('[razorpay] confirmed', order.orderNumber);
    return NextResponse.json({ received: true, order: order.orderNumber, status: 'confirmed' });
  } catch (error) {
    console.error('[razorpay] webhook failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
