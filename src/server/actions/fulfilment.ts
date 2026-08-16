'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OrderStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { requireOrderAccess } from '@/lib/session';
import { readCheckoutSettings } from '@/lib/settings';
import { transitionOrder } from '@/lib/orders';
import { notifyOrderEvent } from '@/lib/notifications';
import { totalWeightGrams } from '@/lib/shipping';
import {
  assignAwb,
  generateLabel,
  isShiprocketConfigured,
  pushOrder,
  trackingUrlFor,
} from '@/lib/shiprocket';
import type { OrderAddressSnapshot } from '@/lib/orders';

/*
  Fulfilment — the three buttons a member of staff presses, in order:
  push the order to Shiprocket, get an AWB, print the label.

  Kept as separate actions rather than one "ship it" button because each can
  fail independently against a third party, and a single button that did all
  three would leave staff unable to tell which step needs retrying. Each is
  idempotent: pushing an already-pushed order returns the existing ids rather
  than creating a second shipment.

  §6 puts fulfilment squarely in STAFF's remit — "view orders, update
  fulfilment, print invoices and labels" — so `requireOrderAccess` is the guard
  throughout. None of these actions reads or writes a price.
*/

const orderIdSchema = z.object({ orderId: z.string().min(1) });

export type FulfilmentResult = { ok: true; message: string } | { ok: false; error: string };

const NOT_CONFIGURED =
  'Shiprocket is not connected on this deployment. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD, or enter the AWB by hand.';

/**
 * Create the shipment in Shiprocket.
 *
 * Only for an order that is CONFIRMED or later — pushing a PENDING_PAYMENT
 * order would ask a courier to collect something that may never be paid for.
 */
export async function pushToShiprocket(input: unknown): Promise<FulfilmentResult> {
  const user = await requireOrderAccess();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid order.' };

  if (!isShiprocketConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { items: true },
  });

  if (!order) return { ok: false, error: 'That order no longer exists.' };

  if (order.status === OrderStatus.PENDING_PAYMENT) {
    return {
      ok: false,
      error: 'This order has not been paid for yet. It cannot be handed to a courier.',
    };
  }
  if (order.shiprocketOrderId && order.shiprocketShipmentId) {
    return { ok: true, message: `Already pushed as shipment ${order.shiprocketShipmentId}.` };
  }

  const settings = await readCheckoutSettings();
  if (!settings.shipping.shiprocketPickupLocation) {
    return {
      ok: false,
      error:
        'No Shiprocket pickup location is set. Enter the pickup point’s name from the Shiprocket dashboard in Settings.',
    };
  }

  const address = order.shippingAddress as unknown as OrderAddressSnapshot;

  // The same weight the order was rated on, recomputed from the item snapshots
  // rather than stored — `weightGrams` is not on `Order`, and a variant's
  // weight can have changed since. The courier weighs the parcel anyway; this
  // is a declaration, not a charge.
  const variants = await db.productVariant.findMany({
    where: {
      id: { in: order.items.map((i) => i.variantId).filter((id): id is string => Boolean(id)) },
    },
    select: { id: true, weightGrams: true },
  });
  const weightById = new Map(variants.map((v) => [v.id, v.weightGrams]));

  const weightGrams = totalWeightGrams(
    order.items.map((item) => ({
      quantity: item.quantity,
      weightGrams: item.variantId ? (weightById.get(item.variantId) ?? null) : null,
    })),
    settings.shipping,
  );

  const pushed = await pushOrder({
    orderNumber: order.orderNumber,
    placedAt: order.createdAt,
    pickupLocationName: settings.shipping.shiprocketPickupLocation,

    customerName: address?.fullName ?? 'Customer',
    email: order.guestEmail,
    phone: address?.phone ?? order.guestPhone ?? '',
    addressLine1: address?.line1 ?? '',
    addressLine2: address?.line2 ?? null,
    city: address?.city ?? '',
    state: address?.state ?? '',
    pincode: address?.pincode ?? '',

    items: order.items.map((item) => ({
      name: item.nameSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      hsnCode: item.hsnCode,
    })),
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    discountPaise: order.discountPaise,
    codAmountPaise: order.paymentMethod === 'COD' ? order.totalPaise : 0,
    paymentMethod: order.paymentMethod,
    weightGrams,
  });

  if (!pushed) {
    return {
      ok: false,
      error:
        'Shiprocket did not accept the order. The details are in the server log — check the pickup location name first, it is the usual cause.',
    };
  }

  await db.order.update({
    where: { id: order.id },
    data: {
      shiprocketOrderId: pushed.shiprocketOrderId,
      shiprocketShipmentId: pushed.shipmentId,
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Order',
    entityId: order.id,
    before: { shiprocketShipmentId: order.shiprocketShipmentId },
    after: { shiprocketShipmentId: pushed.shipmentId },
  });

  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true, message: `Pushed to Shiprocket as shipment ${pushed.shipmentId}.` };
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
  if (order.status === OrderStatus.CONFIRMED) {
    const packed = await transitionOrder({ orderId: order.id, to: OrderStatus.PACKED, actor: 'STAFF' });
    if (!packed.ok) return { ok: false, error: packed.error };
  }

  const shipped = await transitionOrder({
    orderId: order.id,
    to: OrderStatus.SHIPPED,
    actor: 'STAFF',
  });
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

  if (order.status === OrderStatus.CONFIRMED) {
    const packed = await transitionOrder({ orderId: order.id, to: OrderStatus.PACKED, actor: 'STAFF' });
    if (!packed.ok) return { ok: false, error: packed.error };
  }
  if (order.status !== OrderStatus.SHIPPED) {
    const shipped = await transitionOrder({
      orderId: order.id,
      to: OrderStatus.SHIPPED,
      actor: 'STAFF',
    });
    if (!shipped.ok) return { ok: false, error: shipped.error };
  }

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
