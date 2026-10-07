import type { Paise } from '@/lib/money';

/**
 * Pure aggregation for the reports screen.
 *
 * Every figure is derived from order *snapshots* — `OrderItem.nameSnapshot`,
 * `skuSnapshot`, `unitPricePaise`, and the `shippingAddress` JSON — never from
 * the live catalogue. That is deliberate and it is the whole point of the
 * snapshot rule: last quarter's best sellers must not change because someone
 * renamed a product or a variant was deleted this morning.
 *
 * Money stays `Int` paise throughout. Nothing here divides by 100.
 *
 * Framework-free so the arithmetic can be unit tested without a database,
 * matching `../inventory/stock.ts` and `src/lib/pricing.ts`.
 */

/**
 * The statuses that count as a sale.
 *
 * `PENDING_PAYMENT` is excluded because the money never arrived. `CANCELLED`,
 * `RETURNED` and `REFUNDED` are excluded because it arrived and went back —
 * counting them would overstate revenue, which is the one direction a report
 * must never be wrong in.
 */
export const SALES_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;

export type SalesStatus = (typeof SALES_STATUSES)[number];

export interface ReportOrder {
  status: string;
  paymentMethod: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  totalPaise: number;
  shippingAddress: unknown;
  appliedDiscounts: unknown;
  createdAt: Date;
}

export interface ReportItem {
  skuSnapshot: string;
  nameSnapshot: string;
  quantity: number;
  totalPaise: number;
}

export interface SalesSummary {
  orderCount: number;
  revenuePaise: Paise;
  /** Goods only — what the products came to before delivery, COD fee and discount. */
  subtotalPaise: Paise;
  discountPaise: Paise;
  shippingPaise: Paise;
  codFeePaise: Paise;
  /** Revenue ÷ orders, rounded to the nearest paisa. Zero when there are no orders. */
  averageOrderPaise: Paise;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function isSale(order: Pick<ReportOrder, 'status'>): boolean {
  return (SALES_STATUSES as readonly string[]).includes(order.status);
}

export function summariseSales(orders: ReportOrder[]): SalesSummary {
  const sales = orders.filter(isSale);
  const revenuePaise = sum(sales.map((o) => o.totalPaise));

  return {
    orderCount: sales.length,
    revenuePaise: revenuePaise as Paise,
    subtotalPaise: sum(sales.map((o) => o.subtotalPaise)) as Paise,
    discountPaise: sum(sales.map((o) => o.discountPaise)) as Paise,
    shippingPaise: sum(sales.map((o) => o.shippingPaise)) as Paise,
    codFeePaise: sum(sales.map((o) => o.codFeePaise)) as Paise,
    // Integer division, so the average of three ₹100 orders is ₹100 and never
    // ₹99.999…; a fractional paisa does not exist.
    averageOrderPaise: (sales.length === 0
      ? 0
      : Math.round(revenuePaise / sales.length)) as Paise,
  };
}

export interface BestSeller {
  sku: string;
  name: string;
  quantity: number;
  revenuePaise: Paise;
}

/**
 * Units shifted per SKU, biggest first.
 *
 * Keyed on `skuSnapshot` rather than `variantId` because `variantId` is
 * nullable — a combo line carries a `comboId` instead, and a variant deleted
 * since the sale leaves the id dangling. The SKU is on every line and never
 * changes after the fact.
 *
 * Ties break on SKU so the order is stable between runs rather than following
 * whatever order the rows came back in.
 */
export function bestSellers(items: ReportItem[], limit = 10): BestSeller[] {
  const byKey = new Map<string, BestSeller>();

  for (const item of items) {
    const key = item.skuSnapshot;
    const found = byKey.get(key);
    if (found) {
      found.quantity += item.quantity;
      found.revenuePaise = (found.revenuePaise + item.totalPaise) as Paise;
    } else {
      byKey.set(key, {
        sku: key,
        name: item.nameSnapshot,
        quantity: item.quantity,
        revenuePaise: item.totalPaise as Paise,
      });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenuePaise - a.revenuePaise || a.sku.localeCompare(b.sku))
    .slice(0, limit);
}

export interface Split {
  label: string;
  orderCount: number;
  revenuePaise: Paise;
  /** Share of orders, in basis points — percentages are bps here as everywhere. */
  shareBps: number;
}

function splitBy(orders: ReportOrder[], key: (order: ReportOrder) => string): Split[] {
  const sales = orders.filter(isSale);
  const byLabel = new Map<string, { orderCount: number; revenuePaise: number }>();

  for (const order of sales) {
    const label = key(order);
    const found = byLabel.get(label) ?? { orderCount: 0, revenuePaise: 0 };
    found.orderCount += 1;
    found.revenuePaise += order.totalPaise;
    byLabel.set(label, found);
  }

  return [...byLabel.entries()]
    .map(([label, totals]) => ({
      label,
      orderCount: totals.orderCount,
      revenuePaise: totals.revenuePaise as Paise,
      shareBps: sales.length === 0 ? 0 : Math.round((totals.orderCount / sales.length) * 10_000),
    }))
    .sort((a, b) => b.orderCount - a.orderCount || a.label.localeCompare(b.label));
}

/** Cash on delivery against prepaid — the split BBTC cares about for working capital. */
export function paymentSplit(orders: ReportOrder[]): Split[] {
  return splitBy(orders, (order) => (order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'));
}

/**
 * Reads the delivery state out of an order's address snapshot.
 *
 * The snapshot is `Json`, so it is `unknown` until proven otherwise: an order
 * written by an older version of the checkout, or hand-repaired in the
 * database, can be any shape at all. Anything unreadable is bucketed rather
 * than dropped, so the state rows always add up to the order count.
 */
export function readState(shippingAddress: unknown): string {
  if (!shippingAddress || typeof shippingAddress !== 'object') return 'Unknown';
  const state = (shippingAddress as Record<string, unknown>).state;
  return typeof state === 'string' && state.trim() !== '' ? state.trim() : 'Unknown';
}

export function stateSplit(orders: ReportOrder[]): Split[] {
  return splitBy(orders, (order) => readState(order.shippingAddress));
}

export interface DiscountPerformance {
  label: string;
  orderCount: number;
  /** What this discount actually gave away, across the orders that used it. */
  givenPaise: Paise;
}

interface AppliedDiscountLike {
  discountId?: unknown;
  code?: unknown;
  type?: unknown;
  amountPaise?: unknown;
}

/**
 * What each offer cost, read from the `appliedDiscounts` snapshot.
 *
 * Labelled by coupon code where there is one and by discount type where there
 * is not — an automatic offer has `code: null`, and "No code" against a ₹40,000
 * giveaway is not a useful line in a report.
 */
export function discountPerformance(orders: ReportOrder[], limit = 10): DiscountPerformance[] {
  const byLabel = new Map<string, { orderCount: number; givenPaise: number }>();

  for (const order of orders.filter(isSale)) {
    if (!Array.isArray(order.appliedDiscounts)) continue;

    // One order using the same offer twice must still count as one order.
    const seen = new Set<string>();

    for (const raw of order.appliedDiscounts as AppliedDiscountLike[]) {
      if (!raw || typeof raw !== 'object') continue;

      const code = typeof raw.code === 'string' && raw.code.trim() !== '' ? raw.code.trim() : null;
      const type = typeof raw.type === 'string' ? raw.type : 'Offer';
      const label = code ?? `Automatic — ${type.toLowerCase().replace(/_/g, ' ')}`;
      const amount = typeof raw.amountPaise === 'number' ? raw.amountPaise : 0;

      const found = byLabel.get(label) ?? { orderCount: 0, givenPaise: 0 };
      if (!seen.has(label)) {
        found.orderCount += 1;
        seen.add(label);
      }
      found.givenPaise += amount;
      byLabel.set(label, found);
    }
  }

  return [...byLabel.entries()]
    .map(([label, totals]) => ({
      label,
      orderCount: totals.orderCount,
      givenPaise: totals.givenPaise as Paise,
    }))
    .sort((a, b) => b.givenPaise - a.givenPaise || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** The ranges the screen offers, in days. */
export const RANGE_DAYS = [7, 30, 90, 365] as const;

export function rangeLabel(days: number): string {
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  if (days === 90) return 'Last 90 days';
  if (days === 365) return 'Last 12 months';
  return `Last ${days} days`;
}

/** Clamps whatever arrived in the URL to a range the screen actually offers. */
export function readRange(raw: string | undefined): number {
  const value = Number(raw);
  return (RANGE_DAYS as readonly number[]).includes(value) ? value : 30;
}

export function since(days: number, now: Date = new Date()): Date {
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return from;
}
