import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { loadDiscountCandidates, resolveCartLines } from '@/lib/cart-pricing';
import type { CartLineRef } from '@/lib/cart-line';
import { checkCodEligibility } from '@/lib/cod';
import {
  planRelease,
  planReservation,
  planRestock,
  unitsByVariant,
  type AllocationStep,
  type InventoryRow,
} from '@/lib/inventory';
import { calculateCart } from '@/lib/pricing';
import { assignInvoiceNumber } from '@/lib/invoice';
import { financialYearCode, formatOrderNumber, parseOrderNumber } from '@/lib/order-number';
import { canTransition, inventoryEffect } from '@/lib/order-status';
import { resolveDeliveryState } from '@/lib/pincode';
import { isServiceablePincode, totalWeightGrams } from '@/lib/shipping';
import { quoteDelivery } from '@/lib/delivery';
import { readCheckoutSettings } from '@/lib/settings';
import {
  RAZORPAY_MIN_AMOUNT_PAISE,
  createRazorpayOrder,
  razorpayConfig,
} from '@/lib/razorpay';

/*
  Order creation — brief §4:

    "Order creation is one Prisma $transaction: re-read prices → re-run pricing
     → check inventory → increment reserved → generate order number → create
     Order and OrderItem snapshots → increment discount usage. Any failure rolls
     back the lot."

  Every one of those steps is below, in that order, inside one interactive
  transaction. Since Phase 6 one more thing happens inside it, and three
  deliberately do not.

  Inside, added in Phase 6:

    - **The tax invoice number.** §10 requires it generated transactionally and
      gapless, so it is taken in whichever transaction confirms the order —
      this one for COD, `transitionOrder` for a prepaid order whose webhook has
      landed. See the note at the top of `invoice.ts` for why confirmation and
      not placement is the moment.

  Outside, all for the same reason — a third party must never be able to hold a
  database lock or roll back a sale:

    - The Razorpay order. A network call inside a database transaction holds
      locks for as long as a third party takes to answer. The local order is
      created first, in PENDING_PAYMENT, and the Razorpay id is attached
      afterwards — see `startPayment`. Creating the Razorpay order first would
      be worse: a database failure would then leave a payable order Razorpay
      knows about and this database does not, which is money taken against
      nothing.
    - **The delivery rate**, which may call Shiprocket. Settled before the
      transaction opens and passed in — see `quoteDelivery`.
    - **Every email and WhatsApp message.** Dispatched by `notifications.ts`
      after the transition has committed, never within it. An order that is
      paid for must not be rolled back because Resend timed out.
    - The customer's cart. It is cleared by the client after a successful
      placement; the server has no access to localStorage.

  Failures that the customer can act on are returned as `{ ok: false, error }`
  rather than thrown, because "cash on delivery is not available at this
  pincode" is a message, not an exception. Anything unexpected still throws and
  reaches Sentry.
*/

export interface OrderAddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}

/** The address as it is snapshotted onto the order. Never a relation — §7. */
export interface OrderAddressSnapshot extends OrderAddressInput {
  line2: string | null;
  country: string;
}

export interface PlaceOrderInput {
  lines: CartLineRef[];
  discountCode?: string;
  email?: string | null;
  phone: string;
  paymentMethod: 'RAZORPAY' | 'COD';
  shipping: OrderAddressInput;
  /** Omitted or null means "same as delivery". */
  billing?: OrderAddressInput | null;
  userId?: string | null;
  notes?: string | null;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalPaise: number;
  /** Null for COD, and for a prepaid order whose payment could not be started. */
  razorpayOrderId: string | null;
}

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrder }
  | { ok: false; error: string; unavailableLines?: CartLineRef[] };

/** Raised for a state the customer cannot fix and an administrator must. */
export class OrderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderConfigurationError';
  }
}

/**
 * Raised when a discount's `usageLimit` was hit by a concurrent order between
 * this order's quote and its transaction — the customer can fix this, by
 * trying again without the code. Thrown inside `placeOrder`'s transaction so
 * the whole order rolls back rather than being created with a discount that
 * technically oversold its limit.
 */
export class DiscountExhaustedError extends Error {
  constructor() {
    super('A discount on this order just reached its usage limit.');
    this.name = 'DiscountExhaustedError';
  }
}

function snapshotAddress(address: OrderAddressInput, state: string): OrderAddressSnapshot {
  return {
    fullName: address.fullName.trim(),
    phone: address.phone.trim(),
    line1: address.line1.trim(),
    line2: address.line2?.trim() ? address.line2.trim() : null,
    city: address.city.trim(),
    // The resolved state, not the submitted one — see `resolveDeliveryState`.
    state,
    pincode: address.pincode.trim(),
    country: 'India',
  };
}

/**
 * The BBTC entity that sold this order, per §11.
 *
 * Brief §14 Q6 is the reason this is a lookup and not a constant:
 * brightblue.in publishes the same GSTIN for two different entities at
 * different Palakkad addresses, and two entities cannot share one. Rather than
 * pick one, an administrator marks the seller of record in /admin/settings and
 * enters its GSTIN there. Until they do, this refuses — a sale that cannot name
 * its seller cannot be invoiced, and an order that can never be invoiced should
 * not be taken.
 */
export async function resolveSellerEntity(
  client: Prisma.TransactionClient = db,
): Promise<{ id: string; legalName: string; gstin: string }> {
  const sellers = await client.entity.findMany({
    where: { isSeller: true, isActive: true },
    select: { id: true, legalName: true, gstin: true },
    orderBy: { legalName: 'asc' },
  });

  if (sellers.length === 0) {
    throw new OrderConfigurationError(
      'No seller of record is configured. An administrator must choose one in Settings before orders can be taken.',
    );
  }
  if (sellers.length > 1) {
    throw new OrderConfigurationError(
      `More than one entity is marked as the seller of record (${sellers
        .map((s) => s.legalName)
        .join(', ')}). Exactly one may be.`,
    );
  }

  const seller = sellers[0];
  if (!seller.gstin) {
    throw new OrderConfigurationError(
      `${seller.legalName} is the seller of record but has no GSTIN. Add it in Settings — an invoice cannot be raised without it.`,
    );
  }

  return { id: seller.id, legalName: seller.legalName, gstin: seller.gstin };
}

/**
 * The next order number for the financial year, gapless.
 *
 * A transaction-scoped advisory lock serialises the read-then-insert against
 * every other concurrent order, and the sequence is derived from the highest
 * committed number rather than a counter — so a transaction that rolls back
 * leaves no gap, because it never held a number in the first place. The
 * five-digit zero padding is what makes a lexicographic `ORDER BY` the same as
 * a numeric one.
 *
 * The lock is per financial year, so 1 April does not contend with 31 March.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const fy = financialYearCode(now);

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bbtc:order-number:${fy}`}))`;

  const rows = await tx.$queryRaw<{ orderNumber: string }[]>`
    SELECT "orderNumber" FROM "Order"
    WHERE "orderNumber" LIKE ${`BB-${fy}-%`}
    ORDER BY "orderNumber" DESC
    LIMIT 1
  `;

  const highest = rows[0] ? parseOrderNumber(rows[0].orderNumber) : null;
  return formatOrderNumber((highest?.sequence ?? 0) + 1, now);
}

/**
 * Inventory rows for a set of variants, keyed by variant id — locked for the
 * rest of the transaction.
 *
 * The lock is what makes the stock check true. Without it, two checkouts
 * read the same "20 available", both plan against it, and both apply their
 * delta: 12 simultaneous orders of 2 against 20 units all went through and
 * left a row at −4 (found against Supabase, 28 September 2026). With it, the
 * second checkout waits here until the first commits, then reads what is
 * actually left. Rows are locked in id order so two carts sharing variants
 * cannot deadlock.
 */
async function inventoryFor(
  tx: Prisma.TransactionClient,
  variantIds: string[],
): Promise<Map<string, InventoryRow[]>> {
  if (variantIds.length === 0) return new Map();
  await tx.$queryRaw`
    SELECT id FROM "Inventory"
    WHERE "variantId" IN (${Prisma.join(variantIds)})
    ORDER BY id
    FOR UPDATE
  `;
  const rows = await tx.inventory.findMany({
    where: { variantId: { in: variantIds }, location: { isActive: true } },
    select: { id: true, variantId: true, quantity: true, reserved: true },
  });

  const byVariant = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const list = byVariant.get(row.variantId) ?? [];
    list.push({ id: row.id, quantity: row.quantity, reserved: row.reserved });
    byVariant.set(row.variantId, list);
  }
  return byVariant;
}

/**
 * How a batch of allocation steps changes `Inventory` rows. Each mode maps to
 * exactly the field deltas the four call sites below used to build by hand.
 */
type AllocationMode = 'reserve' | 'commit' | 'release' | 'restock';

const ALLOCATION_SQL: Readonly<Record<AllocationMode, Prisma.Sql>> = Object.freeze({
  reserve: Prisma.sql`SET reserved = i.reserved + v.qty`,
  commit: Prisma.sql`SET reserved = i.reserved - v.qty, quantity = i.quantity - v.qty`,
  release: Prisma.sql`SET reserved = i.reserved - v.qty`,
  restock: Prisma.sql`SET quantity = i.quantity + v.qty`,
});

/**
 * Applies every step in one statement rather than one round trip per row —
 * a cart with N distinct variants used to cost N sequential awaited updates
 * while holding this interactive transaction's connection, on every
 * reservation, commit, release and restock.
 */
async function applySteps(
  tx: Prisma.TransactionClient,
  steps: AllocationStep[],
  mode: AllocationMode,
): Promise<void> {
  if (steps.length === 0) return;

  const values = Prisma.join(
    steps.map((step) => Prisma.sql`(${step.inventoryId}::text, ${step.quantity}::integer)`),
  );

  await tx.$executeRaw`
    UPDATE "Inventory" AS i
    ${ALLOCATION_SQL[mode]}
    FROM (VALUES ${values}) AS v(id, qty)
    WHERE i.id = v.id
  `;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (input.lines.length === 0) {
    return { ok: false, error: 'Your cart is empty.' };
  }

  const settings = await readCheckoutSettings();

  // The delivery state decides CGST + SGST versus IGST, so it is derived from
  // the pincode wherever the pincode is unambiguous, and only falls back to
  // what the customer selected where it genuinely is not.
  const delivery = resolveDeliveryState(input.shipping.pincode, input.shipping.state);
  if ('error' in delivery) {
    return { ok: false, error: delivery.error };
  }
  const pincode = input.shipping.pincode.trim();

  /*
    Delivery is rated *before* the transaction opens, for the same reason the
    Razorpay call sits outside it: `quoteDelivery` may call Shiprocket, and a
    third-party request inside a database transaction holds locks for as long
    as that third party takes to answer.

    Pricing the cart twice is the cost — once here for a weight, once inside
    the transaction for the authoritative prices. That is a read, and it buys
    the guarantee that no lock is ever held across a network call.

    Serviceability comes from this quote rather than from the prefix list
    directly, because a live answer knows things the list does not. It still
    degrades to the list whenever Shiprocket cannot be reached — see
    `delivery.ts`.
  */
  const preview = await resolveCartLines(input.lines);
  const deliveryQuote = await quoteDelivery({
    settings: settings.shipping,
    deliveryPincode: pincode,
    weightGrams: totalWeightGrams(preview.snapshots, settings.shipping),
    cod: input.paymentMethod === 'COD',
    declaredValuePaise: preview.subtotalPaise,
  });

  if (!deliveryQuote.serviceable) {
    // Asked with cod=1, "nobody goes there" can mean "nobody collects cash
    // there" — which online payment would still reach.
    return {
      ok: false,
      error:
        input.paymentMethod === 'COD' && deliveryQuote.source === 'shiprocket'
          ? 'Cash on delivery is not available at that pincode. Pay online instead, or call 1800 123 0621.'
          : 'We do not deliver to that pincode yet. Call 1800 123 0621 and we will help.',
    };
  }

  if (deliveryQuote.fallbackReason) {
    console.warn('[orders] delivery priced from the slab table:', deliveryQuote.fallbackReason);
  }

  const seller = await resolveSellerEntity();

  const placed = await db.$transaction(
    async (tx) => {
      // 1–2. Re-read every price through this transaction, and re-price.
      const resolved = await resolveCartLines(input.lines, tx);

      if (resolved.unavailable.length > 0) {
        return {
          ok: false as const,
          error:
            'Some items in your cart are no longer available. Remove them and place the order again.',
          unavailableLines: resolved.unavailable,
        };
      }
      if (resolved.lines.length === 0) {
        return { ok: false as const, error: 'Your cart is empty.' };
      }

      // The rate settled before this transaction opened. It is not re-rated
      // here: it may have come from Shiprocket, and this is exactly where a
      // network call must not happen.
      const shippingQuote = deliveryQuote;

      let codFeePaise = 0;
      if (input.paymentMethod === 'COD') {
        const cod = checkCodEligibility(settings.cod, {
          subtotalPaise: resolved.subtotalPaise,
          pincode,
        });
        if (!cod.eligible) {
          return { ok: false as const, error: cod.reason ?? 'Cash on delivery is not available.' };
        }
        codFeePaise = cod.feePaise;
      }

      const { discounts } = await loadDiscountCandidates(input.discountCode, tx);
      const customerUsage = input.userId ? await customerDiscountUsage(input.userId, tx) : undefined;

      const priced = calculateCart({
        lines: resolved.lines,
        discounts,
        discountCode: input.discountCode,
        shippingState: delivery.state,
        shippingPaise: shippingQuote.pricePaise,
        codFeePaise,
        paymentMethod: input.paymentMethod,
        customerId: input.userId ?? undefined,
        customerUsage,
      });

      if (
        input.paymentMethod === 'RAZORPAY' &&
        priced.totalPaise < RAZORPAY_MIN_AMOUNT_PAISE
      ) {
        return {
          ok: false as const,
          error: 'An online payment has to be at least ₹1.00. Choose cash on delivery instead.',
        };
      }

      // 3–4. Check stock and take the hold.
      const units = unitsByVariant(resolved.snapshots);
      const stock = await inventoryFor(tx, [...units.keys()]);
      const reservations: AllocationStep[] = [];

      for (const [variantId, quantity] of units) {
        const plan = planReservation(stock.get(variantId) ?? [], quantity);
        if (plan === null) {
          const name =
            resolved.snapshots.find((s) => s.variantId === variantId)?.nameSnapshot ?? 'An item';
          return {
            ok: false as const,
            error: `${name} does not have ${quantity} in stock. Reduce the quantity and try again.`,
          };
        }
        reservations.push(...plan);
      }

      await applySteps(tx, reservations, 'reserve');

      // 5. The order number, under a per-financial-year advisory lock. Shared
      // with the invoice number below so both sequences read the financial
      // year from the same instant — otherwise an order placed in the last
      // millisecond of one financial year could roll to the new year's order
      // sequence but the old year's invoice sequence (or vice versa) if the
      // two calls straddled midnight on 31 March independently.
      const now = new Date();
      const orderNumber = await nextOrderNumber(tx, now);

      // A COD order has no payment to wait for, so it is confirmed on
      // placement — and its hold becomes a real decrement immediately, which is
      // what `commit` means for a prepaid order once its webhook lands.
      const isCod = input.paymentMethod === 'COD';
      const shippingSnapshot = snapshotAddress(input.shipping, delivery.state);
      const billingSnapshot = input.billing
        ? snapshotAddress(input.billing, resolveBillingState(input.billing))
        : shippingSnapshot;

      // 6. The order and its item snapshots. `priced.lines` is 1:1 with
      // `resolved.lines` in order, which is what makes zipping the snapshots on
      // by index correct — asserted in pricing.test.ts.
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: input.userId ?? null,
          guestEmail: input.userId ? null : (input.email?.trim() || null),
          guestPhone: input.userId ? null : input.phone.trim(),
          subtotalPaise: priced.subtotalPaise,
          discountPaise: priced.discountPaise,
          shippingPaise: priced.shippingPaise,
          codFeePaise: priced.codFeePaise,
          cgstPaise: priced.taxByHsn.cgstPaise,
          sgstPaise: priced.taxByHsn.sgstPaise,
          igstPaise: priced.taxByHsn.igstPaise,
          totalPaise: priced.totalPaise,
          taxByHsn: priced.taxByHsn as unknown as Prisma.InputJsonValue,
          appliedDiscounts: priced.appliedDiscounts as unknown as Prisma.InputJsonValue,
          shippingAddress: shippingSnapshot as unknown as Prisma.InputJsonValue,
          billingAddress: billingSnapshot as unknown as Prisma.InputJsonValue,
          status: isCod ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT,
          paymentMethod: isCod ? PaymentMethod.COD : PaymentMethod.RAZORPAY,
          paymentStatus: PaymentStatus.PENDING,
          sellerEntityId: seller.id,
          notes: input.notes?.trim() || null,
          items: {
            create: priced.lines.map((line, index) => {
              const snapshot = resolved.snapshots[index];
              return {
                variantId: snapshot.variantId,
                comboId: snapshot.comboId,
                nameSnapshot: snapshot.nameSnapshot,
                skuSnapshot: snapshot.skuSnapshot,
                imageSnapshot: snapshot.imageSnapshot,
                choiceSnapshot: snapshot.choiceSnapshot
                  ? (snapshot.choiceSnapshot as unknown as Prisma.InputJsonValue)
                  : Prisma.DbNull,
                quantity: snapshot.quantity,
                // `totalPaise` (netPaise) is the authoritative, discount-inclusive
                // amount actually charged for this line, and must stay exactly
                // that — order items have to sum to what was really charged.
                // `unitPricePaise` is derived from that *same* number, not a
                // separate pre-discount subtotal (the two used to disagree even
                // before rounding, whenever a discount applied). For a combo
                // component, `snapshot.quantity` is the physical unit count
                // (e.g. 3 bottles) while the line itself was priced as one
                // package share (§8's `distributeProportionally`), so this
                // division is not always exact — Rate × Qty can be up to
                // `quantity - 1` paise off Amount when it doesn't divide evenly.
                // That is an unavoidable consequence of pricing indivisible
                // paise across several physical units, not a bug in the total.
                unitPricePaise: Math.round(line.netPaise / snapshot.quantity),
                totalPaise: line.netPaise,
                hsnCode: snapshot.hsnCode,
                gstRate: snapshot.gstRate,
              };
            }),
          },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          totalPaise: true,
        },
      });

      // 7. Discount usage. The increment IS the ceiling check, not a separate
      // read-then-write: `loadDiscountCandidates` read `usageCount` outside
      // any lock, so under concurrent checkouts several transactions can all
      // see "1 below the limit" and all pass. Only a conditional UPDATE that
      // re-checks the limit at write time, inside this transaction, actually
      // closes that — if fewer rows matched than discounts applied, some
      // discount hit its limit between the read and here, and the whole
      // order rolls back rather than overselling the offer.
      if (priced.appliedDiscounts.length > 0) {
        const ids = Prisma.join(priced.appliedDiscounts.map((applied) => applied.discountId));
        const updated = await tx.$executeRaw`
          UPDATE "Discount" SET "usageCount" = "usageCount" + 1
          WHERE id IN (${ids}) AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
        `;
        if (updated < priced.appliedDiscounts.length) {
          throw new DiscountExhaustedError();
        }
      }

      if (isCod) {
        await applySteps(tx, reservations, 'commit');

        /*
          A COD order is created CONFIRMED — there is no payment to wait for —
          so this *is* its confirmation transaction, and the tax invoice is
          raised here for the same reason `transitionOrder` raises one on
          PENDING_PAYMENT → CONFIRMED. A prepaid order gets nothing yet: it is
          not a supply until Razorpay says it was paid for.
        */
        await assignInvoiceNumber(tx, order.id, now);
      }

      return { ok: true as const, order: { ...order, razorpayOrderId: null } };
    },
    // Several round trips, an advisory lock and a nested create. The default
    // 5s is tight for a cold serverless connection.
    { timeout: 20_000, maxWait: 10_000 },
  );

  return placed;
}

/**
 * How many times this customer has already used each discount, for
 * `perCustomerLimit`.
 *
 * Read out of the `appliedDiscounts` snapshot on their past orders rather than
 * from a counter table, because that snapshot is already the record of what was
 * granted. Cancelled and refunded orders are excluded — a coupon on an order
 * that never happened has not been spent.
 */
async function customerDiscountUsage(
  userId: string,
  client: Prisma.TransactionClient = db,
): Promise<Record<string, number>> {
  const rows = await client.$queryRaw<{ discountId: string; uses: bigint }[]>`
    SELECT applied->>'discountId' AS "discountId", count(*) AS uses
    FROM "Order", jsonb_array_elements("appliedDiscounts") AS applied
    WHERE "userId" = ${userId}
      AND "status" NOT IN ('CANCELLED', 'REFUNDED')
      AND applied->>'discountId' IS NOT NULL
    GROUP BY 1
  `;

  const usage: Record<string, number> = {};
  for (const row of rows) usage[row.discountId] = Number(row.uses);
  return usage;
}

/**
 * A billing address's state is taken as given: it is where the customer is
 * billed, not where the goods go, so it has no say in the tax split and cannot
 * be checked against the delivery pincode.
 */
function resolveBillingState(billing: OrderAddressInput): string {
  return billing.state.trim();
}

/**
 * Attach a Razorpay order to a placed prepaid order.
 *
 * Outside the creation transaction on purpose — see the note at the top of this
 * file. If Razorpay cannot be reached the local order is cancelled rather than
 * left sitting in `PENDING_PAYMENT` forever: cancelling releases the stock hold
 * and keeps the admin order list honest about what is actually collectable. The
 * customer is told to try again, which starts a fresh order.
 */
export async function startPayment(
  order: PlacedOrder,
  options: { customerName: string; email?: string | null; phone: string },
): Promise<{ ok: true; razorpayOrderId: string; keyId: string } | { ok: false; error: string }> {
  const config = razorpayConfig();
  if (!config) {
    await transitionOrder({
      orderId: order.id,
      to: OrderStatus.CANCELLED,
      actor: 'STAFF',
      note: 'Cancelled automatically: online payment is not configured on this deployment.',
    });
    return {
      ok: false,
      error: 'Online payment is not available right now. Choose cash on delivery, or call 1800 123 0621.',
    };
  }

  try {
    const razorpayOrder = await createRazorpayOrder({
      amountPaise: order.totalPaise,
      receipt: order.orderNumber,
      notes: {
        orderNumber: order.orderNumber,
        customer: options.customerName,
        phone: options.phone,
        ...(options.email ? { email: options.email } : {}),
      },
    });

    await db.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: razorpayOrder.id },
    });

    return { ok: true, razorpayOrderId: razorpayOrder.id, keyId: config.keyId };
  } catch (error) {
    console.error('[orders] could not start payment for', order.orderNumber, error);
    await transitionOrder({
      orderId: order.id,
      to: OrderStatus.CANCELLED,
      actor: 'STAFF',
      note: 'Cancelled automatically: the payment could not be started.',
    });
    return {
      ok: false,
      error: 'We could not reach the payment provider. Nothing has been charged — please try again.',
    };
  }
}

export interface CheckoutQuote {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  intraState: boolean;
  deliveryState: string | null;
  appliedDiscounts: { id: string; label: string; amountPaise: number }[];
  invalidDiscountCode: boolean;
  unavailableLines: CartLineRef[];
  /** Null when the pincode is serviceable; the reason otherwise. */
  serviceabilityError: string | null;
  cod: { available: boolean; reason: string | null; feePaise: number };
  shippingUnconfigured: boolean;
  weightGrams: number | null;
}

/**
 * Price a cart for the checkout screen, with a delivery address if one has been
 * entered.
 *
 * The same functions the order transaction uses, in the same order, so the
 * figure the customer agrees to is arrived at the same way as the figure they
 * are charged. It writes nothing — a quote is not a reservation, and stock is
 * only checked when the order is placed.
 */
export async function quoteOrder(input: {
  lines: CartLineRef[];
  discountCode?: string;
  pincode?: string;
  state?: string;
  paymentMethod: 'RAZORPAY' | 'COD';
  userId?: string | null;
}): Promise<CheckoutQuote> {
  const settings = await readCheckoutSettings();
  const resolved = await resolveCartLines(input.lines);
  const { discounts } = await loadDiscountCandidates(input.discountCode);

  const pincode = input.pincode?.trim() ?? '';
  const delivery = pincode ? resolveDeliveryState(pincode, input.state) : null;
  const deliveryState = delivery && 'state' in delivery ? delivery.state : null;

  // No address yet means no rate and no tax split to quote — the drawer's
  // subtotal is honest, a total pretending to include delivery would not be.
  // The same `quoteDelivery` the order transaction uses, so the figure shown
  // at checkout is arrived at the same way as the figure charged.
  const shippingQuote =
    deliveryState && pincode
      ? await quoteDelivery({
          settings: settings.shipping,
          deliveryPincode: pincode,
          weightGrams: totalWeightGrams(resolved.snapshots, settings.shipping),
          cod: input.paymentMethod === 'COD',
          declaredValuePaise: resolved.subtotalPaise,
        })
      : null;

  const serviceabilityError =
    pincode && (shippingQuote ? !shippingQuote.serviceable : !isServiceablePincode(settings.shipping, pincode))
      ? 'We do not deliver to that pincode yet.'
      : null;

  const codCheck = pincode
    ? checkCodEligibility(settings.cod, { subtotalPaise: resolved.subtotalPaise, pincode })
    : { eligible: false, reason: null, feePaise: 0 };
  // Shiprocket's courier coverage can switch COD off for a pincode the
  // allowlist would accept; it can never switch it on.
  const codAvailable =
    settings.cod.enabled && codCheck.eligible && shippingQuote?.codServiceable !== false;
  const codFeePaise = input.paymentMethod === 'COD' && codAvailable ? codCheck.feePaise : 0;

  // Same call `placeOrder` makes before pricing — without it, a signed-in
  // customer at their `perCustomerLimit` saw the discounted total quoted
  // here (nothing checked their usage) and was then charged the
  // undiscounted total when the order was actually placed, with nothing
  // surfacing the difference since the browser never sends a total.
  const customerUsage = input.userId ? await customerDiscountUsage(input.userId) : undefined;

  const priced = calculateCart({
    lines: resolved.lines,
    discounts,
    discountCode: input.discountCode,
    shippingState: deliveryState ?? undefined,
    shippingPaise: shippingQuote?.pricePaise ?? 0,
    codFeePaise,
    paymentMethod: input.paymentMethod,
    customerId: input.userId ?? undefined,
    customerUsage,
  });

  const labels = await discountLabels(priced.appliedDiscounts.map((d) => d.discountId));

  return {
    subtotalPaise: priced.subtotalPaise,
    discountPaise: priced.discountPaise,
    shippingPaise: priced.shippingPaise,
    codFeePaise: priced.codFeePaise,
    taxPaise: priced.taxByHsn.taxPaise,
    totalPaise: priced.totalPaise,
    intraState: priced.taxByHsn.intraState,
    deliveryState,
    appliedDiscounts: priced.appliedDiscounts.map((d) => ({
      id: d.discountId,
      label: labels.get(d.discountId) ?? d.code ?? 'Offer applied',
      amountPaise: d.amountPaise,
    })),
    invalidDiscountCode: priced.invalidDiscountCode,
    unavailableLines: resolved.unavailable,
    serviceabilityError,
    cod: {
      available: codAvailable,
      reason: settings.cod.enabled
        ? (codCheck.reason ??
          (shippingQuote?.codServiceable === false
            ? 'Cash on delivery is not available at this pincode.'
            : null))
        : null,
      feePaise: codAvailable ? settings.cod.feePaise : 0,
    },
    shippingUnconfigured: settings.shippingUnconfigured,
    weightGrams: resolved.weightGrams,
  };
}

/** `Discount.publicLabel` for the cart, never `Discount.name`, which is internal. */
async function discountLabels(ids: string[]): Promise<Map<string, string | null>> {
  const labels = new Map<string, string | null>();
  if (ids.length === 0) return labels;
  try {
    const rows = await db.discount.findMany({
      where: { id: { in: ids } },
      select: { id: true, publicLabel: true },
    });
    for (const row of rows) labels.set(row.id, row.publicLabel);
  } catch (error) {
    console.warn('[orders] discount labels unavailable:', error);
  }
  return labels;
}

/**
 * Adds a system note without discarding whatever was already there — most
 * often the customer's own delivery instructions from checkout, which a
 * later system-generated note (e.g. a payment-start failure) must not erase.
 */
function appendNote(existing: string | null, addition: string): string {
  return existing ? `${existing}\n\n${addition}` : addition;
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Move an order's status, with the state machine and the stock effect applied
 * together in one transaction.
 *
 * `actor` is what keeps §10 true: `'STAFF'` cannot reach `CONFIRMED` from
 * `PENDING_PAYMENT` however the call is made, so no admin button and no client
 * callback can confirm a payment Razorpay has not signed for.
 */
export async function transitionOrder(input: {
  orderId: string;
  to: OrderStatus;
  actor: 'STAFF' | 'WEBHOOK';
  paymentStatus?: PaymentStatus;
  razorpayPaymentId?: string;
  note?: string;
}): Promise<TransitionResult> {
  return db.$transaction(
    async (tx) => {
      // Row lock, taken before anything is read: a redelivered webhook (or a
      // staff click racing one) must not see the pre-transition status twice.
      // The second caller blocks here until the first's transaction commits
      // or rolls back, then re-reads the now-current status below and hits
      // the idempotent early return instead of double-processing.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;

      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          status: true,
          notes: true,
          items: { select: { variantId: true, quantity: true } },
        },
      });

      if (!order) return { ok: false as const, error: 'That order no longer exists.' };
      if (order.status === input.to) return { ok: true as const }; // Idempotent by design.

      if (!canTransition(order.status, input.to, input.actor)) {
        return {
          ok: false as const,
          error: `An order cannot move from ${order.status} to ${input.to}.`,
        };
      }

      const units = unitsByVariant(order.items);
      const stock = await inventoryFor(tx, [...units.keys()]);
      const effect = inventoryEffect(order.status, input.to);

      // One batch across every variant on the order, not one call per
      // variant — `effect` is decided once for the whole transition, not
      // per line, so every variant's steps can go into the same statement.
      if (effect === 'commit' || effect === 'release') {
        const steps = [...units].flatMap(([variantId, quantity]) =>
          planRelease(stock.get(variantId) ?? [], quantity),
        );
        await applySteps(tx, steps, effect);
      } else if (effect === 'restock') {
        const steps = [...units].flatMap(([variantId, quantity]) =>
          planRestock(stock.get(variantId) ?? [], quantity),
        );
        await applySteps(tx, steps, 'restock');
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: input.to,
          ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
          ...(input.razorpayPaymentId ? { razorpayPaymentId: input.razorpayPaymentId } : {}),
          // Appended, never replaced — `notes` is also where the customer's own
          // delivery instructions from checkout live, and a system note (e.g.
          // "payment could not be started") must not erase those.
          ...(input.note ? { notes: appendNote(order.notes, input.note) } : {}),
        },
      });

      /*
        The tax invoice is raised here, in the same transaction as the
        confirmation, because §10 requires the number to be generated
        transactionally and gapless. Taking it at *confirmation* rather than at
        placement is what makes gapless achievable — a prepaid order that is
        never paid never holds a number. See the note at the top of
        `invoice.ts`.

        `assignInvoiceNumber` is idempotent, so a replayed webhook cannot raise
        a second invoice for the same supply.
      */
      if (input.to === OrderStatus.CONFIRMED) {
        await assignInvoiceNumber(tx, order.id);
      }

      return { ok: true as const };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/**
 * How long a prepaid order gets to actually pay before its stock hold is
 * released back to everyone else. Not spec — no document names a number —
 * chosen to comfortably exceed how long Razorpay Checkout itself stays open
 * on screen, so this only ever catches a cart genuinely abandoned mid-payment,
 * never one someone is still looking at.
 */
export const STALE_ORDER_MINUTES = 60;

export interface ExpireStaleOrdersResult {
  found: number;
  cancelled: string[];
  failed: { orderNumber: string; error: string }[];
}

/**
 * Releases the inventory hold on every `PENDING_PAYMENT` order older than
 * `STALE_ORDER_MINUTES` — the missing half of the reservation pattern
 * `inventory.ts` already implements. A reservation with no expiry is not a
 * reservation, it is a slow leak: every abandoned Razorpay checkout would
 * otherwise hold real stock away from a customer who would actually pay.
 *
 * Meant to be called on a schedule (see `/api/cron/expire-stale-orders`), not
 * from a request path — it can process an unbounded number of orders and has
 * no reason to run inside anything a customer is waiting on.
 *
 * Cancelling here never restocks — `inventoryEffect` gives `PENDING_PAYMENT →
 * CANCELLED` a `release` effect, not `restock`, because nothing was ever
 * actually decremented for an order that never got confirmed. No customer
 * notification either: cancellation has no entry in `eventForStatus`, and a
 * customer who never finished paying does not need to be told they didn't.
 */
export async function expireStaleOrders(
  now: Date = new Date(),
): Promise<ExpireStaleOrdersResult> {
  const cutoff = new Date(now.getTime() - STALE_ORDER_MINUTES * 60 * 1000);

  const stale = await db.order.findMany({
    where: { status: OrderStatus.PENDING_PAYMENT, createdAt: { lt: cutoff } },
    select: { id: true, orderNumber: true },
  });

  const cancelled: string[] = [];
  const failed: { orderNumber: string; error: string }[] = [];

  for (const order of stale) {
    const result = await transitionOrder({
      orderId: order.id,
      to: OrderStatus.CANCELLED,
      actor: 'STAFF',
      note: `Automatically cancelled: payment was not completed within ${STALE_ORDER_MINUTES} minutes.`,
    });
    if (result.ok) {
      cancelled.push(order.orderNumber);
    } else {
      failed.push({ orderNumber: order.orderNumber, error: result.error });
    }
  }

  return { found: stale.length, cancelled, failed };
}
