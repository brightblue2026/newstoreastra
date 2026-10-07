'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OrderStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { requireOrderAccess } from '@/lib/session';
import { transitionOrder, type TransitionResult } from '@/lib/orders';
import { notifyOrderEvent } from '@/lib/notifications';
import {
  assignAwb,
  cancelShiprocketOrder,
  generateLabel,
  isShiprocketConfigured,
  trackingUrlFor,
} from '@/lib/shiprocket';
import {
  NOT_CONFIGURED,
  pushOrderToShiprocket,
  schedulePickupAndManifest,
} from '@/lib/shiprocket-fulfilment';

/**
 * Moves CONFIRMED → PACKED → SHIPPED, recording the PACKED step for real when
 * staff assign an AWB straight from CONFIRMED (see the comment at its call
 * site below). Safe to call when the order is already at or past SHIPPED —
 * `transitionOrder` is idempotent by design (moving to the status an order is
 * already in is a no-op), so neither caller needs its own guard for that.
 */
async function ensureShippedViaPacked(
  orderId: string,
  currentStatus: OrderStatus,
): Promise<TransitionResult> {
  if (currentStatus === OrderStatus.CONFIRMED) {
    const packed = await transitionOrder({ orderId, to: OrderStatus.PACKED, actor: 'STAFF' });
    if (!packed.ok) return packed;
  }
  return transitionOrder({ orderId, to: OrderStatus.SHIPPED, actor: 'STAFF' });
}

/*
  Fulfilment. The everyday path is one button, `shipWithShiprocket`: create
  the shipment if the automatic push has not, assign an AWB, book the pickup,
  fetch the manifest and the label. Every step is idempotent and cached on the
  order, so when one fails against Shiprocket, pressing Ship again resumes
  from that step — and the message names the step that stopped. The single
  steps stay exported for the manual retries on the order page.

  §6 puts fulfilment squarely in STAFF's remit — "view orders, update
  fulfilment, print invoices and labels" — so `requireOrderAccess` is the guard
  throughout. None of these actions reads or writes a price.
*/

const orderIdSchema = z.object({ orderId: z.string().min(1) });

export type FulfilmentResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Create the shipment in Shiprocket. Usually already done by the automatic
 * push on confirmation; this is the button for when that is off or failed.
 */
export async function pushToShiprocket(input: unknown): Promise<FulfilmentResult> {
  const user = await requireOrderAccess();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid order.' };

  const result = await pushOrderToShiprocket(parsed.data.orderId, user.id);
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return result;
}

/**
 * Assign an AWB and move the order to SHIPPED.
 *
 * The status change and the customer message go together on purpose: an AWB
 * with no notification is a tracking number nobody was given.
 */
export async function assignAwbAndShip(input: unknown): Promise<FulfilmentResult> {
  const user = await requireOrderAccess();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid order.' };

  if (!isShiprocketConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      shiprocketShipmentId: true,
      awbNumber: true,
    },
  });

  if (!order) return { ok: false, error: 'That order no longer exists.' };
  if (!order.shiprocketShipmentId) {
    return { ok: false, error: 'Push this order to Shiprocket first.' };
  }

  // Already shipped on this AWB: nothing to move and, above all, nothing to
  // tell the customer twice. This is what makes the Ship button safe to press
  // again after a later step failed.
  const shippedOrLater: OrderStatus[] = [
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.RETURNED,
  ];
  if (order.awbNumber && shippedOrLater.includes(order.status)) {
    return { ok: true, message: `Shipped on AWB ${order.awbNumber}.` };
  }

  let awbNumber = order.awbNumber;
  let courierName: string | null = null;
  let trackingUrl: string | null = null;

  if (!awbNumber) {
    const awb = await assignAwb(order.shiprocketShipmentId);
    if (!awb) {
      return {
        ok: false,
        error:
          'Shiprocket could not assign an AWB. This usually means no courier serves that pincode at this weight, or the account has no balance.',
      };
    }
    awbNumber = awb.awbNumber;
    courierName = awb.courierName;
    trackingUrl = awb.trackingUrl;

    await db.order.update({
      where: { id: order.id },
      data: { awbNumber, courierName, trackingUrl },
    });
  }

  /*
    PACKED is a step the state machine requires between CONFIRMED and SHIPPED,
    and it is a real one — someone put the goods in a box. When staff assign an
    AWB straight from CONFIRMED, that is what they did, so it is recorded
    rather than skipped: the order passes through PACKED and on to SHIPPED, and
    the audit trail shows both.
  */
  const shipped = await ensureShippedViaPacked(order.id, order.status);
  if (!shipped.ok) return { ok: false, error: shipped.error };

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Order',
    entityId: order.id,
    before: { status: order.status, awbNumber: order.awbNumber },
    after: { status: OrderStatus.SHIPPED, awbNumber },
  });

  // After the transition has committed, never inside it.
  await notifyOrderEvent({ orderId: order.id, event: 'SHIPPED' });

  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true, message: `Shipped on AWB ${awbNumber}. The customer has been told.` };
}

/**
 * Fetch (and cache) the shipping label URL.
 *
 * Cached on the order because Shiprocket bills label generation; reprinting
 * should not re-generate.
 */
export async function fetchLabel(input: unknown): Promise<FulfilmentResult & { url?: string }> {
  await requireOrderAccess();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid order.' };

  if (!isShiprocketConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, shiprocketShipmentId: true, labelUrl: true, awbNumber: true },
  });

  if (!order) return { ok: false, error: 'That order no longer exists.' };
  if (order.labelUrl) return { ok: true, message: 'Label ready.', url: order.labelUrl };
  if (!order.shiprocketShipmentId) {
    return { ok: false, error: 'Push this order to Shiprocket first.' };
  }
  if (!order.awbNumber) {
    return { ok: false, error: 'Assign an AWB before printing a label.' };
  }

  const url = await generateLabel(order.shiprocketShipmentId);
  if (!url) {
    return { ok: false, error: 'Shiprocket could not generate the label. Try again shortly.' };
  }

  await db.order.update({ where: { id: order.id }, data: { labelUrl: url } });

  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true, message: 'Label ready.', url };
}

/**
 * Record an AWB entered by hand.
 *
 * §10's rule that a third party must never block an order applies to
 * fulfilment too: BBTC already ships with DTDC directly, and an order must be
 * dispatchable when Shiprocket is down or was never connected. This is the
 * manual path, and it moves the order and notifies exactly as the automatic
 * one does.
 */
const manualAwbSchema = z.object({
  orderId: z.string().min(1),
  awbNumber: z.string().trim().min(4).max(40),
  courierName: z.string().trim().min(2).max(60),
});

export async function recordManualAwb(input: unknown): Promise<FulfilmentResult> {
  const user = await requireOrderAccess();
  const parsed = manualAwbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Enter both the tracking number and the courier name.' };
  }

  const { orderId, awbNumber, courierName } = parsed.data;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, awbNumber: true },
  });
  if (!order) return { ok: false, error: 'That order no longer exists.' };

  await db.order.update({
    where: { id: order.id },
    data: { awbNumber, courierName, trackingUrl: trackingUrlFor(awbNumber) },
  });

  const shipped = await ensureShippedViaPacked(order.id, order.status);
  if (!shipped.ok) return { ok: false, error: shipped.error };

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Order',
    entityId: order.id,
    before: { status: order.status, awbNumber: order.awbNumber },
    after: { status: OrderStatus.SHIPPED, awbNumber, courierName },
  });

  await notifyOrderEvent({ orderId: order.id, event: 'SHIPPED' });

  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true, message: `Recorded AWB ${awbNumber}. The customer has been told.` };
}

/**
 * The one "Ship" button: every remaining Shiprocket step, in order. Stops at
 * the first step that fails and says which one, so pressing it again resumes
 * there — every step before it is cached on the order.
 */
export async function shipWithShiprocket(
  input: unknown,
): Promise<FulfilmentResult & { labelUrl?: string }> {
  await requireOrderAccess();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid order.' };
  if (!isShiprocketConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const { orderId } = parsed.data;

  const pushed = await pushToShiprocket({ orderId });
  if (!pushed.ok) return { ok: false, error: `Step 1 of 4, create shipment: ${pushed.error}` };

  const shipped = await assignAwbAndShip({ orderId });
  if (!shipped.ok) return { ok: false, error: `Step 2 of 4, assign AWB: ${shipped.error}` };

  const pickup = await schedulePickupAndManifest(orderId);
  if (!pickup.ok) {
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: false, error: `Step 3 of 4, book pickup: ${pickup.error}` };
  }

  const label = await fetchLabel({ orderId });
  if (!label.ok) return { ok: false, error: `Step 4 of 4, label: ${label.error}` };

  revalidatePath(`/admin/orders/${orderId}`);
  return {
    ok: true,
    message: `${shipped.message} ${pickup.message} Print the label and hand the parcel over.`,
    ...(label.url ? { labelUrl: label.url } : {}),
  };
}

/** Book the courier collection and fetch the manifest — the retry for step 3. */
export async function bookPickup(input: unknown): Promise<FulfilmentResult> {
  await requireOrderAccess();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid order.' };
  if (!isShiprocketConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const result = await schedulePickupAndManifest(parsed.data.orderId);
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return result;
}

/**
 * Cancel the order in Shiprocket and forget its shipment here, so it can be
 * pushed again or shipped by hand. For test orders above all — Shiprocket has
 * no sandbox. The store's own order status is not touched; cancel or refund
 * the order itself separately if that is what is meant.
 */
export async function cancelInShiprocket(input: unknown): Promise<FulfilmentResult> {
  const user = await requireOrderAccess();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid order.' };
  if (!isShiprocketConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, status: true, shiprocketOrderId: true, awbNumber: true },
  });
  if (!order) return { ok: false, error: 'That order no longer exists.' };
  if (!order.shiprocketOrderId) return { ok: false, error: 'This order is not in Shiprocket.' };
  if (order.status === OrderStatus.DELIVERED) {
    return { ok: false, error: 'This order has been delivered. It cannot be cancelled in Shiprocket.' };
  }

  const cancelled = await cancelShiprocketOrder(order.shiprocketOrderId);
  if (!cancelled.ok) return { ok: false, error: `Shiprocket did not cancel it: ${cancelled.error}` };

  await db.order.update({
    where: { id: order.id },
    data: {
      shiprocketOrderId: null,
      shiprocketShipmentId: null,
      shiprocketError: null,
      awbNumber: null,
      courierName: null,
      trackingUrl: null,
      labelUrl: null,
      manifestUrl: null,
      pickupRequestedAt: null,
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Order',
    entityId: order.id,
    before: { shiprocketOrderId: order.shiprocketOrderId, awbNumber: order.awbNumber },
    after: { shiprocketOrderId: null, awbNumber: null },
  });

  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true, message: 'Cancelled in Shiprocket. Any AWB charge goes back to the wallet.' };
}
