import 'server-only';
import { db } from '@/lib/db';
import type { HsnTaxRow, TaxByHsnResult } from '@/lib/gst';
import type { OrderAddressSnapshot } from '@/lib/orders';

/**
 * Read models for looking at an order — the customer's confirmation and
 * tracking page, and the admin's order list and detail.
 *
 * `Order.taxByHsn`, `appliedDiscounts` and the two addresses are JSON columns.
 * They were written by this application from typed values, so they are read
 * back through narrow accessors that tolerate a row from an older shape rather
 * than casting and hoping: a confirmation page that throws because one field
 * moved is worse than one that omits a line.
 */

export interface OrderViewItem {
  id: string;
  nameSnapshot: string;
  skuSnapshot: string;
  imageSnapshot: string | null;
  choiceSnapshot: { slotLabel: string; picks: string[] }[] | null;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  hsnCode: string;
  gstRate: number;
  comboId: string | null;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  guestEmail: string | null;
  guestPhone: string | null;
  customerPhone: string | null;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  totalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxRows: HsnTaxRow[];
  taxPaise: number;
  intraState: boolean;
  appliedDiscounts: { code: string | null; amountPaise: number }[];
  shippingAddress: OrderAddressSnapshot | null;
  billingAddress: OrderAddressSnapshot | null;
  items: OrderViewItem[];
  awbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  notes: string | null;
  sellerLegalName: string | null;
}

/** Narrow an unknown JSON value to an address snapshot, or null. */
function readAddress(value: unknown): OrderAddressSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : '');
  if (!text('line1') && !text('city')) return null;
  return {
    fullName: text('fullName'),
    phone: text('phone'),
    line1: text('line1'),
    line2: typeof record.line2 === 'string' ? record.line2 : null,
    city: text('city'),
    state: text('state'),
    pincode: text('pincode'),
    country: text('country') || 'India',
  };
}

function readTaxByHsn(value: unknown): Pick<TaxByHsnResult, 'rows' | 'taxPaise' | 'intraState'> {
  const empty = { rows: [] as HsnTaxRow[], taxPaise: 0, intraState: false };
  if (!value || typeof value !== 'object') return empty;
  const record = value as Record<string, unknown>;
  return {
    rows: Array.isArray(record.rows) ? (record.rows as HsnTaxRow[]) : [],
    taxPaise: typeof record.taxPaise === 'number' ? record.taxPaise : 0,
    intraState: record.intraState === true,
  };
}

function readAppliedDiscounts(value: unknown): { code: string | null; amountPaise: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    return [
      {
        code: typeof record.code === 'string' ? record.code : null,
        amountPaise: typeof record.amountPaise === 'number' ? record.amountPaise : 0,
      },
    ];
  });
}

export function readChoices(value: unknown): { slotLabel: string; picks: string[] }[] | null {
  if (!Array.isArray(value)) return null;
  const choices = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const picks = Array.isArray(record.picks) ? record.picks.filter((p) => typeof p === 'string') : [];
    if (typeof record.slotLabel !== 'string' || picks.length === 0) return [];
    return [{ slotLabel: record.slotLabel, picks: picks as string[] }];
  });
  return choices.length > 0 ? choices : null;
}

/**
 * One order by its number, with everything both the customer page and the admin
 * detail need. Returns null for an unknown number, and lets a database failure
 * throw — an order page that silently claims "not found" when the database is
 * down would have a customer believing their order vanished.
 */
export async function getOrderByNumber(orderNumber: string): Promise<OrderView | null> {
  const order = await db.order.findUnique({
    where: { orderNumber: orderNumber.trim().toUpperCase() },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      guestEmail: true,
      guestPhone: true,
      subtotalPaise: true,
      discountPaise: true,
      shippingPaise: true,
      codFeePaise: true,
      totalPaise: true,
      cgstPaise: true,
      sgstPaise: true,
      igstPaise: true,
      taxByHsn: true,
      appliedDiscounts: true,
      shippingAddress: true,
      billingAddress: true,
      awbNumber: true,
      courierName: true,
      trackingUrl: true,
      invoiceNumber: true,
      invoiceUrl: true,
      notes: true,
      user: { select: { phone: true } },
      sellerEntityId: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          nameSnapshot: true,
          skuSnapshot: true,
          imageSnapshot: true,
          choiceSnapshot: true,
          quantity: true,
          unitPricePaise: true,
          totalPaise: true,
          hsnCode: true,
          gstRate: true,
          comboId: true,
        },
      },
    },
  });

  if (!order) return null;

  const tax = readTaxByHsn(order.taxByHsn);

  // `Order.sellerEntityId` is a bare String in the §7 schema, not a relation, so
  // this is a second read rather than an include. Left as §7 has it: adding the
  // foreign key would be a migration for a join this needs in two places.
  const seller = await db.entity
    .findUnique({ where: { id: order.sellerEntityId }, select: { legalName: true } })
    .catch(() => null);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    guestEmail: order.guestEmail,
    guestPhone: order.guestPhone,
    customerPhone: order.user?.phone ?? null,
    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    shippingPaise: order.shippingPaise,
    codFeePaise: order.codFeePaise,
    totalPaise: order.totalPaise,
    cgstPaise: order.cgstPaise,
    sgstPaise: order.sgstPaise,
    igstPaise: order.igstPaise,
    taxRows: tax.rows,
    taxPaise: tax.taxPaise,
    intraState: tax.intraState,
    appliedDiscounts: readAppliedDiscounts(order.appliedDiscounts),
    shippingAddress: readAddress(order.shippingAddress),
    billingAddress: readAddress(order.billingAddress),
    awbNumber: order.awbNumber,
    courierName: order.courierName,
    trackingUrl: order.trackingUrl,
    invoiceNumber: order.invoiceNumber,
    invoiceUrl: order.invoiceUrl,
    notes: order.notes,
    sellerLegalName: seller?.legalName ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      skuSnapshot: item.skuSnapshot,
      imageSnapshot: item.imageSnapshot,
      choiceSnapshot: readChoices(item.choiceSnapshot),
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      totalPaise: item.totalPaise,
      hsnCode: item.hsnCode,
      gstRate: item.gstRate,
      comboId: item.comboId,
    })),
  };
}

export interface OrderListRow {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalPaise: number;
  customerName: string;
  place: string;
  itemCount: number;
}

/** The admin order list. Newest first — that is the queue staff work from. */
export async function listOrders(options: {
  status?: string;
  query?: string;
  take?: number;
}): Promise<OrderListRow[]> {
  const rows = await db.order.findMany({
    where: {
      ...(options.status ? { status: options.status as never } : {}),
      ...(options.query
        ? {
            OR: [
              { orderNumber: { contains: options.query.trim().toUpperCase() } },
              { guestPhone: { contains: options.query.replace(/\D/g, '') || ' ' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.take ?? 100,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      totalPaise: true,
      shippingAddress: true,
      _count: { select: { items: true } },
    },
  });

  return rows.map((row) => {
    const address = readAddress(row.shippingAddress);
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      createdAt: row.createdAt,
      status: row.status,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      totalPaise: row.totalPaise,
      customerName: address?.fullName ?? '—',
      place: address ? `${address.city}, ${address.state}` : '—',
      itemCount: row._count.items,
    };
  });
}
