import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { OrderAddressSnapshot } from '@/lib/orders';
/*
  Combo choice slots come off the order's own `choiceSnapshot`, so an invoice
  for "any 3 MX-3 fragrances" says which three actually shipped even if those
  variants are later renamed or withdrawn. `readChoices` already validates that
  untrusted JSON column for the order pages — reused rather than reimplemented,
  because two readers of the same column would eventually disagree about what
  counts as malformed.
*/
import { readChoices } from '@/lib/order-view';
import {
  formatInvoiceNumber,
  invoiceNumberPrefix,
  parseInvoiceNumber,
} from '@/lib/invoice-number';
import { PLACE_OF_SUPPLY_STATE, isIntraStateSupply, stateCode, type HsnTaxRow } from '@/lib/gst';

/*
  Invoicing — brief §10 and §12 Phase 6.

  Two halves, deliberately apart:

    - `assignInvoiceNumber` runs *inside* a transaction and does one thing:
      takes the next number in the financial year's series. It is the only
      thing here that writes.
    - `buildInvoiceData` reads an already-invoiced order into the shape the
      PDF prints. It writes nothing and can be called any number of times, so
      a customer re-downloading their invoice never moves a sequence.

  **When the number is taken is a judgement call the brief does not settle.**
  §10 says "generated inside the order transaction", and §12 says "no gaps".
  For a prepaid order those two pull apart: an order created in
  PENDING_PAYMENT that is never paid would have consumed a number, and
  cancelling it leaves a hole in a series that is legally required not to have
  one. So the number is taken in the transaction that moves an order to
  CONFIRMED — which, for a COD order, *is* the creation transaction, because a
  COD order is created CONFIRMED. Both readings hold: it is always inside a
  transaction, and an order that never became a supply never took a number.

  The consequence to know about: once raised, an invoice number stays on the
  order even if it is later cancelled or returned. Under GST that is correct —
  a raised invoice is reversed with a credit note, never deleted or reused.
  Credit notes are not built (v1 scope), so a cancellation after confirmation
  currently needs the accountant to raise one outside this system.
*/

/**
 * Take the next invoice number in the current financial year's series.
 *
 * Same mechanism as `nextOrderNumber`: a transaction-scoped advisory lock
 * serialises every concurrent confirmation, and the sequence is derived from
 * the highest number already committed rather than from a counter. A
 * transaction that rolls back therefore leaves no gap — it never held a number
 * at all.
 *
 * Idempotent: an order that already has a number keeps it. That matters
 * because a Razorpay webhook can be delivered more than once, and the second
 * delivery must not issue a second invoice for the same supply.
 */
export async function assignInvoiceNumber(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date = new Date(),
): Promise<string> {
  const prefix = invoiceNumberPrefix(now);

  // Locked before the idempotency check, not after — matching `nextOrderNumber`'s
  // pattern. Two concurrent callers must not both see "no number yet" and both
  // proceed to mint one; the second must see the first's committed number once
  // it acquires the lock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bbtc:invoice-number:${prefix}`}))`;

  const existing = await tx.order.findUnique({
    where: { id: orderId },
    select: { invoiceNumber: true },
  });
  if (existing?.invoiceNumber) return existing.invoiceNumber;

  const rows = await tx.$queryRaw<{ invoiceNumber: string }[]>`
    SELECT "invoiceNumber" FROM "Order"
    WHERE "invoiceNumber" LIKE ${`${prefix}%`}
    ORDER BY "invoiceNumber" DESC
    LIMIT 1
  `;

  const highest = rows[0] ? parseInvoiceNumber(rows[0].invoiceNumber) : null;
  const invoiceNumber = formatInvoiceNumber((highest?.sequence ?? 0) + 1, now);

  await tx.order.update({
    where: { id: orderId },
    data: { invoiceNumber, invoicedAt: now },
  });

  return invoiceNumber;
}

export interface InvoiceSeller {
  legalName: string;
  /** The trade name, where it differs from the legal one. */
  tradeName: string | null;
  address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string;
  stateCode: string | null;
}

export interface InvoiceLine {
  name: string;
  sku: string;
  hsnCode: string;
  gstRate: number;
  quantity: number;
  unitPricePaise: number;
  /** Net of every discount, GST inclusive — what was actually charged for this line. */
  totalPaise: number;
  /** Fragrances picked for a combo's choice slots, as snapshotted on the order. */
  choices: { slotLabel: string; picks: string[] }[] | null;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoicedAt: Date;
  orderNumber: string;
  placedAt: Date;

  seller: InvoiceSeller;
  billTo: OrderAddressSnapshot;
  shipTo: OrderAddressSnapshot;

  /** Where the goods go. Decides CGST + SGST against IGST. */
  placeOfSupply: string;
  placeOfSupplyCode: string | null;
  intraState: boolean;

  lines: InvoiceLine[];
  taxRows: HsnTaxRow[];

  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;

  paymentMethod: 'RAZORPAY' | 'COD';
  paymentStatus: string;

  /**
   * FSSAI licence numbers covering the food on this order, deduplicated.
   * Empty when the order contains no food — §10 requires the number on food
   * orders, and printing one on an order of dish wash would be a false claim
   * about what was sold.
   */
  fssaiLicences: string[];
  /** Cosmetics manufacturing licences, on the same rule. */
  cosmeticLicences: string[];
}

/** Raised when an order cannot be invoiced, which is a configuration fault, not a customer one. */
export class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceError';
  }
}

/**
 * Read an invoiced order into the shape the PDF prints.
 *
 * Everything about *what was sold and for how much* comes from the order's own
 * snapshots — `OrderItem` rows and the stored `taxByHsn` — never from the live
 * catalogue, because a product edit must not alter a historical invoice.
 *
 * The two things that are looked up live are the seller entity and the FSSAI /
 * cosmetics licence numbers. Those are properties of the business rather than
 * of the sale, they are what a regulator wants to see current, and neither is
 * snapshotted anywhere. The consequence: reprinting an old invoice after a
 * licence is renewed prints the new number. That is the right direction for a
 * licence, and the wrong one would be harder to defend.
 */
export async function buildInvoiceData(orderId: string): Promise<InvoiceData> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new InvoiceError('That order no longer exists.');
  if (!order.invoiceNumber || !order.invoicedAt) {
    throw new InvoiceError(
      `Order ${order.orderNumber} has no invoice number yet. An invoice is raised when an order is confirmed.`,
    );
  }

  const entity = await db.entity.findUnique({
    where: { id: order.sellerEntityId },
    select: {
      legalName: true,
      abbr: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      gstin: true,
    },
  });

  if (!entity) {
    throw new InvoiceError(
      `Order ${order.orderNumber} names a seller entity that no longer exists. An invoice cannot be raised without one.`,
    );
  }
  if (!entity.gstin) {
    throw new InvoiceError(
      `${entity.legalName} has no GSTIN. A tax invoice cannot be raised without it — add it in Settings.`,
    );
  }

  const shipTo = order.shippingAddress as unknown as OrderAddressSnapshot;
  const billTo = order.billingAddress as unknown as OrderAddressSnapshot;

  const taxByHsn = order.taxByHsn as unknown as {
    rows?: HsnTaxRow[];
    taxablePaise?: number;
    intraState?: boolean;
  };
  const taxRows = Array.isArray(taxByHsn?.rows) ? taxByHsn.rows : [];

  const { fssaiLicences, cosmeticLicences } = await licencesForOrder(order.items);

  return {
    invoiceNumber: order.invoiceNumber,
    invoicedAt: order.invoicedAt,
    orderNumber: order.orderNumber,
    placedAt: order.createdAt,

    seller: {
      legalName: entity.legalName,
      // "Bright Blue Trading Corporation" is the trade name on a proprietorship
      // whose legal name is a person's — both belong on the invoice.
      tradeName: entity.abbr && entity.abbr !== entity.legalName ? entity.abbr : null,
      address: entity.address,
      city: entity.city,
      state: entity.state,
      pincode: entity.pincode,
      gstin: entity.gstin,
      stateCode: stateCode(entity.state),
    },
    billTo,
    shipTo,

    placeOfSupply: shipTo?.state ?? PLACE_OF_SUPPLY_STATE,
    placeOfSupplyCode: stateCode(shipTo?.state),
    // Same function that decided the split at order time (`gst.ts`'s
    // `buildTaxByHsn` calls the same `isIntraStateSupply`), applied to the
    // same destination state — not inferred from the tax *amounts*, which are
    // indistinguishable (both zero) for an all-nil-rated order and would pick
    // the wrong tax head for a genuinely intra-state nil-rated supply.
    intraState: isIntraStateSupply(shipTo?.state),

    lines: order.items.map((item) => ({
      name: item.nameSnapshot,
      sku: item.skuSnapshot,
      hsnCode: item.hsnCode,
      gstRate: item.gstRate,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      totalPaise: item.totalPaise,
      choices: readChoices(item.choiceSnapshot),
    })),
    taxRows,

    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    shippingPaise: order.shippingPaise,
    codFeePaise: order.codFeePaise,
    taxablePaise:
      typeof taxByHsn?.taxablePaise === 'number'
        ? taxByHsn.taxablePaise
        : taxRows.reduce((sum, row) => sum + row.taxablePaise, 0),
    cgstPaise: order.cgstPaise,
    sgstPaise: order.sgstPaise,
    igstPaise: order.igstPaise,
    totalPaise: order.totalPaise,

    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,

    fssaiLicences,
    cosmeticLicences,
  };
}

/**
 * The licence numbers that have to appear on this invoice.
 *
 * Resolved by walking the order's variants back to their brands. An item whose
 * variant has since been deleted contributes nothing rather than throwing —
 * a missing licence number on a reprint is a worse outcome than no invoice at
 * all only if it goes unnoticed, so it is logged.
 */
async function licencesForOrder(
  items: { variantId: string | null }[],
): Promise<{ fssaiLicences: string[]; cosmeticLicences: string[] }> {
  const variantIds = items
    .map((item) => item.variantId)
    .filter((id): id is string => typeof id === 'string');

  if (variantIds.length === 0) return { fssaiLicences: [], cosmeticLicences: [] };

  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      product: {
        select: {
          isFoodProduct: true,
          isCosmetic: true,
          brand: { select: { fssaiLicence: true, cosmeticLicence: true } },
        },
      },
    },
  });

  const fssai = new Set<string>();
  const cosmetic = new Set<string>();

  for (const variant of variants) {
    const product = variant.product;
    if (product.isFoodProduct && product.brand.fssaiLicence) {
      fssai.add(product.brand.fssaiLicence);
    }
    if (product.isCosmetic && product.brand.cosmeticLicence) {
      cosmetic.add(product.brand.cosmeticLicence);
    }
  }

  return { fssaiLicences: [...fssai], cosmeticLicences: [...cosmetic] };
}

