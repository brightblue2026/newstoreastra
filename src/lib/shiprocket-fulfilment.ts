import 'server-only';
import { OrderStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { readCheckoutSettings } from '@/lib/settings';
import { completeBox, parcelDimensions, type BoxCm, type ParcelLine } from '@/lib/parcel';
import {
  isShiprocketConfigured,
  pushOrder,
  requestPickup,
  generateManifest,
} from '@/lib/shiprocket';
import type { OrderAddressSnapshot } from '@/lib/orders';
import type { ShippingSettings } from '@/lib/shipping';

/*
  The Shiprocket steps that do not depend on who pressed the button — shared
  by the admin actions in `server/actions/fulfilment.ts` (which check the role
  first) and by the automatic push after a Razorpay webhook or a COD order
  (where the system itself is the actor).

  Nothing in here decides an order's status. Status moves only through
  `transitionOrder`, from the admin action or the tracking webhook.
*/

export type StepResult = { ok: true; message: string } | { ok: false; error: string };

export const NOT_CONFIGURED =
  'Shiprocket is not connected on this deployment. Add SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD, or enter the AWB by hand.';

/**
 * Weight and box for an order, from its item snapshots' current variants and
 * combos. A combo with its own weight or box is declared as that carton;
 * otherwise its components count individually. Unweighed units fall back to
 * the admin's default unit weight, unmeasured ones to the default carton.
 */
export async function orderParcel(
  items: { variantId: string | null; comboId: string | null; quantity: number }[],
  settings: Pick<ShippingSettings, 'defaultUnitGrams'>,
): Promise<{ weightGrams: number; box: BoxCm }> {
  const variantIds = items.map((i) => i.variantId).filter((id): id is string => Boolean(id));
  const comboIds = items.map((i) => i.comboId).filter((id): id is string => Boolean(id));

  const boxFields = { weightGrams: true, lengthCm: true, breadthCm: true, heightCm: true } as const;

  const [variants, combos] = await Promise.all([
    db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, ...boxFields } }),
    db.combo.findMany({
      where: { id: { in: comboIds } },
      select: {
        id: true,
        ...boxFields,
        items: { select: { quantity: true, variant: { select: boxFields } } },
      },
    }),
  ]);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const comboById = new Map(combos.map((c) => [c.id, c]));

  let weightGrams = 0;
  const parcelLines: ParcelLine[] = [];
  const unitGrams = (grams: number | null) => grams ?? settings.defaultUnitGrams;

  /*
    A combo is stored as one OrderItem per component (see `cart-pricing.ts`),
    each carrying the physical units shipped. So a combo's lines are gathered
    first, and the number of packages is recovered as the units shipped over
    the units in one package.
  */
  const comboUnits = new Map<string, number>();

  for (const item of items) {
    const combo = item.comboId ? comboById.get(item.comboId) : undefined;
    if (combo && (combo.weightGrams !== null || completeBox(combo))) {
      comboUnits.set(combo.id, (comboUnits.get(combo.id) ?? 0) + item.quantity);
    }
  }

  for (const [comboId, units] of comboUnits) {
    const combo = comboById.get(comboId)!;
    const perPackage = combo.items.reduce((sum, c) => sum + c.quantity, 0);
    const packages = Math.max(1, Math.round(units / Math.max(perPackage, 1)));

    weightGrams +=
      (combo.weightGrams ??
        combo.items.reduce((sum, c) => sum + unitGrams(c.variant.weightGrams) * c.quantity, 0)) *
      packages;

    if (completeBox(combo)) {
      parcelLines.push({ quantity: packages, box: combo });
    } else {
      for (const component of combo.items) {
        parcelLines.push({ quantity: component.quantity * packages, box: component.variant });
      }
    }
  }

  for (const item of items) {
    // Already counted as a whole package above.
    if (item.comboId && comboUnits.has(item.comboId)) continue;

    const variant = item.variantId ? variantById.get(item.variantId) : undefined;
    weightGrams += unitGrams(variant?.weightGrams ?? null) * item.quantity;
    parcelLines.push({ quantity: item.quantity, box: variant ?? null });
  }

  return { weightGrams, box: parcelDimensions(parcelLines) };
}

/**
 * Create the order in Shiprocket. Idempotent: an already-pushed order returns
 * its existing shipment. `userId` is null when the system pushes on its own.
 *
 * A failure is written to `Order.shiprocketError` so staff see why on the order
 * page, and cleared on success.
 */
export async function pushOrderToShiprocket(
  orderId: string,
  userId: string | null,
): Promise<StepResult> {
  if (!isShiprocketConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { ok: false, error: 'That order no longer exists.' };

  // Pushing a PENDING_PAYMENT order would ask a courier to collect something
  // that may never be paid for.
  if (order.status === OrderStatus.PENDING_PAYMENT) {
    return {
      ok: false,
      error: 'This order has not been paid for yet. It cannot be handed to a courier.',
    };
  }
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
    return { ok: false, error: 'This order is cancelled. There is nothing to ship.' };
  }
  if (order.shiprocketOrderId && order.shiprocketShipmentId) {
    return { ok: true, message: `Already in Shiprocket as shipment ${order.shiprocketShipmentId}.` };
  }

  const settings = await readCheckoutSettings();
  if (!settings.shipping.shiprocketPickupLocation) {
    return fail(
      order.id,
      'No Shiprocket pickup location is set. Choose one in Settings → Shiprocket.',
    );
  }

  const address = order.shippingAddress as unknown as OrderAddressSnapshot;
  const parcel = await orderParcel(order.items, settings.shipping);

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
    weightGrams: parcel.weightGrams,
    box: parcel.box,
  });

  if (!pushed.ok) {
    return fail(order.id, `Shiprocket refused the order: ${pushed.error}`);
  }

  await db.order.update({
    where: { id: order.id },
    data: {
      shiprocketOrderId: pushed.result.shiprocketOrderId,
      shiprocketShipmentId: pushed.result.shipmentId,
      shiprocketError: null,
    },
  });

  // The audit log records people. An automatic push has none, and the
  // shipment id on the order is its own record.
  if (userId) {
    await recordAudit({
      userId,
      action: 'update',
      entityType: 'Order',
      entityId: order.id,
      before: { shiprocketShipmentId: order.shiprocketShipmentId },
      after: { shiprocketShipmentId: pushed.result.shipmentId },
    });
  }

  return { ok: true, message: `Created in Shiprocket as shipment ${pushed.result.shipmentId}.` };
}

async function fail(orderId: string, error: string): Promise<StepResult> {
  await db.order
    .update({ where: { id: orderId }, data: { shiprocketError: error } })
    .catch(() => {});
  return { ok: false, error };
}

/**
 * The automatic push after confirmation. Never throws — it runs inside
 * `after()` from a webhook, where an exception would only be noise.
 */
export async function autoPushOrder(orderId: string): Promise<void> {
  try {
    if (!isShiprocketConfigured()) return;
    const settings = await readCheckoutSettings();
    if (!settings.shipping.autoPushOrders) return;

    const result = await pushOrderToShiprocket(orderId, null);
    if (!result.ok) console.warn('[shiprocket] auto-push failed for', orderId, result.error);
  } catch (error) {
    console.error('[shiprocket] auto-push threw for', orderId, error);
  }
}

/**
 * Book the courier collection and fetch the manifest, once an AWB exists.
 * Both are idempotent against Shiprocket and cached on the order.
 */
export async function schedulePickupAndManifest(orderId: string): Promise<StepResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      shiprocketOrderId: true,
      shiprocketShipmentId: true,
      awbNumber: true,
      pickupRequestedAt: true,
      manifestUrl: true,
    },
  });
  if (!order?.shiprocketShipmentId || !order.awbNumber) {
    return { ok: false, error: 'Assign an AWB before booking a pickup.' };
  }

  if (!order.pickupRequestedAt) {
    const pickup = await requestPickup(order.shiprocketShipmentId);
    if (!pickup.ok) return { ok: false, error: `Pickup not booked: ${pickup.error}` };
    await db.order.update({ where: { id: order.id }, data: { pickupRequestedAt: new Date() } });
  }

  if (!order.manifestUrl) {
    const manifestUrl = await generateManifest(order.shiprocketShipmentId, order.shiprocketOrderId);
    if (manifestUrl) {
      await db.order.update({ where: { id: order.id }, data: { manifestUrl } });
    } else {
      return { ok: true, message: 'Pickup booked. The manifest is not ready yet — try again shortly.' };
    }
  }

  return { ok: true, message: 'Pickup booked and manifest ready.' };
}
