import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { OrderStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { transitionOrder } from '@/lib/orders';
import { parseTrackingWebhook, trackingUrlFor } from '@/lib/shiprocket';
import { notifyOrderEvent } from '@/lib/notifications';

/*
  POST /api/webhooks/shiprocket — brief §12 Phase 6, "tracking webhook".

  Shiprocket does not sign its webhooks the way Razorpay does. What it offers
  is a shared secret sent in an `x-api-key` header, configured alongside the
  webhook URL in the Shiprocket dashboard. That is weaker than an HMAC over the
  body — it proves the sender knows a secret, not that the body is untampered —
  so this endpoint is deliberately limited in what it can do:

    - It can move an order forward through SHIPPED, DELIVERED and RETURNED.
    - It cannot confirm a payment. `transitionOrder`'s actor is `'STAFF'`, not
      `'WEBHOOK'`, so `order-status.ts` refuses PENDING_PAYMENT → CONFIRMED from
      here no matter what this route sends. Only Razorpay's signed webhook can
      do that, and that guarantee does not depend on this file being careful.

  Fails closed: no configured token means every request is rejected. An
  unconfigured deployment is not an open one.
*/

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Constant-time compare, tolerant of length mismatch. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(expected.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN?.trim();
  if (!expected) {
    console.warn('[shiprocket] webhook rejected: no SHIPROCKET_WEBHOOK_TOKEN configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 400 });
  }

  const provided =
    request.headers.get('x-api-key') ?? request.headers.get('x-shiprocket-token');

  if (!secretMatches(provided, expected)) {
    console.warn('[shiprocket] webhook rejected: bad token');
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }

  const event = parseTrackingWebhook(payload);
  if (!event) {
    return NextResponse.json({ received: true, ignored: 'unrecognised body' });
  }

  // Find the order by AWB first — it is the identifier Shiprocket owns and
  // cannot be confused with anything else — then by the order number that was
  // pushed as `order_id`.
  const order = await db.order.findFirst({
    where: event.awbNumber
      ? { OR: [{ awbNumber: event.awbNumber }, { orderNumber: event.orderNumber ?? '' }] }
      : { orderNumber: event.orderNumber ?? '' },
    select: { id: true, orderNumber: true, status: true, awbNumber: true },
  });

  if (!order) {
    console.error('[shiprocket] no order matches', event.awbNumber ?? event.orderNumber);
    return NextResponse.json({ received: true, ignored: 'unknown order' });
  }

  // Record what the courier told us even when the scan does not move the
  // order's status — an AWB arriving before the first status change is normal.
  if (event.awbNumber && event.awbNumber !== order.awbNumber) {
    await db.order.update({
      where: { id: order.id },
      data: {
        awbNumber: event.awbNumber,
        trackingUrl: trackingUrlFor(event.awbNumber),
        ...(event.courierName ? { courierName: event.courierName } : {}),
      },
    });
  }

  if (event.status === null) {
    // An intermediate scan. Acknowledged so Shiprocket stops retrying.
    return NextResponse.json({
      received: true,
      order: order.orderNumber,
      ignored: event.rawStatus,
    });
  }

  const target = OrderStatus[event.status];

  if (order.status === target) {
    return NextResponse.json({
      received: true,
      order: order.orderNumber,
      status: 'already handled',
    });
  }

  const result = await transitionOrder({
    orderId: order.id,
    to: target,
    actor: 'STAFF',
  });

  if (!result.ok) {
    /*
      An illegal transition here is expected traffic, not a fault: Shiprocket
      re-sends scans, and a DELIVERED scan can arrive after staff have already
      marked the order RETURNED. Acknowledged with a 200 so Shiprocket stops
      retrying something that will never succeed, and logged so a genuinely
      wrong mapping is visible.
    */
    console.warn(
      '[shiprocket]',
      order.orderNumber,
      `could not move ${order.status} → ${target}:`,
      result.error,
    );
    return NextResponse.json({
      received: true,
      order: order.orderNumber,
      ignored: result.error,
    });
  }

  // Notifications are dispatched after the status has actually moved, and
  // never inside the transaction — see `notifications.ts`.
  await notifyOrderEvent({
    orderId: order.id,
    event: event.outForDelivery && target === OrderStatus.SHIPPED ? 'OUT_FOR_DELIVERY' : target,
  });

  console.info('[shiprocket]', order.orderNumber, '→', target);
  return NextResponse.json({ received: true, order: order.orderNumber, status: target });
}
