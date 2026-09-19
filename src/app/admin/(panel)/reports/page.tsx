import Link from 'next/link';
import { OrderStatus } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
import { requirePricingAccess } from '@/lib/session';
import {
  RANGE_DAYS,
  type Split,
  bestSellers,
  discountPerformance,
  paymentSplit,
  rangeLabel,
  readRange,
  since,
  stateSplit,
  summariseSales,
} from './reports';

const nf = new Intl.NumberFormat('en-IN');

/** Basis points as a percentage, to one decimal — 7500 reads as "75.0%". */
function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * Reports — §12 Phase 7.
 *
 * `requirePricingAccess` rather than catalogue access: every figure on this
 * page is money, and STAFF are explicitly kept away from pricing.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requirePricingAccess();

  const params = await searchParams;
  const days = readRange(params.days);
  const from = since(days);

  const orders = await db.order.findMany({
    where: { createdAt: { gte: from } },
    select: {
      status: true,
      paymentMethod: true,
      subtotalPaise: true,
      discountPaise: true,
      shippingPaise: true,
      codFeePaise: true,
      totalPaise: true,
      shippingAddress: true,
      appliedDiscounts: true,
      createdAt: true,
    },
  });

  // Only items from orders that count as a sale — the same rule the money
  // figures use, so the best sellers cannot disagree with the revenue above.
  const items = await db.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: from },
        status: {
          in: [
            OrderStatus.CONFIRMED,
            OrderStatus.PACKED,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
          ],
        },
      },
    },
    select: { skuSnapshot: true, nameSnapshot: true, quantity: true, totalPaise: true },
  });

  const sales = summariseSales(orders);
  const top = bestSellers(items);
  const payment = paymentSplit(orders);
  const states = stateSplit(orders);
  const discounts = discountPerformance(orders);

  return (
    <div>
      <h1 className="type-display-sm">Reports</h1>
      <p className="mt-4 max-w-2xl type-body text-ink-soft">
        {rangeLabel(days)}. Counts orders that were paid for and not reversed — checkouts that
        were never paid, and anything cancelled, returned or refunded, are left out.
      </p>

      <nav aria-label="Period" className="mt-8 flex flex-wrap gap-2">
        {RANGE_DAYS.map((value) => (
          <Link
            key={value}
            href={`/admin/reports?days=${value}`}
            aria-current={value === days ? 'page' : undefined}
            className={`rounded-control border px-4 py-2 type-caption ${
              value === days ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
            }`}
          >
            {rangeLabel(value)}
          </Link>
        ))}
      </nav>

      {sales.orderCount === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          No paid orders in this period. Once the shop takes its first order, sales, best
          sellers and the payment split appear here.
        </p>
      ) : (
        <>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Revenue" value={formatINR(sales.revenuePaise)} />
            <Figure label="Orders" value={nf.format(sales.orderCount)} />
            <Figure label="Average order" value={formatINR(sales.averageOrderPaise)} />
            <Figure label="Discount given" value={formatINR(sales.discountPaise)} />
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Goods" value={formatINR(sales.subtotalPaise)} muted />
            <Figure label="Delivery charged" value={formatINR(sales.shippingPaise)} muted />
            <Figure label="COD fees" value={formatINR(sales.codFeePaise)} muted />
          </div>

          <Section title="Best sellers" note="By units sold, from the order snapshots.">
            {top.length === 0 ? (
              <Empty>Nothing sold in this period.</Empty>
            ) : (
              <Table
                head={['Product', 'Stock code', 'Units', 'Revenue']}
                rows={top.map((row) => [
                  row.name,
                  row.sku,
                  nf.format(row.quantity),
                  formatINR(row.revenuePaise),
                ])}
              />
            )}
          </Section>

          <Section title="How customers paid" note="Cash on delivery against paid online.">
            <SplitTable rows={payment} />
          </Section>

          <Section title="Where orders went" note="By delivery state on the order.">
            <SplitTable rows={states} />
          </Section>

          <Section title="Offers" note="What each offer gave away, and how many orders used it.">
            {discounts.length === 0 ? (
              <Empty>No offer was applied to an order in this period.</Empty>
            ) : (
              <Table
                head={['Offer', '', 'Orders', 'Given away']}
                rows={discounts.map((row) => [
                  row.label,
                  '',
                  nf.format(row.orderCount),
                  formatINR(row.givenPaise),
                ])}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-card border border-line p-6">
      <p className="type-caption text-ink-soft">{label}</p>
      <p className={`mt-2 type-subhead tabular-nums ${muted ? 'text-ink-soft' : ''}`}>{value}</p>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="type-heading">{title}</h2>
      <p className="mt-2 type-body text-ink-soft">{note}</p>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 type-body text-ink-soft">{children}</p>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-xl border-collapse">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((cell, index) => (
              <th
                key={cell || index}
                className={`py-3 type-caption text-ink-soft ${index >= 2 ? 'text-right' : ''}`}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')} className="border-b border-line">
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={`py-3 ${
                    index >= 2 ? 'text-right type-body tabular-nums' : 'type-body'
                  } ${index === 1 ? 'type-caption normal-case text-ink-soft' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitTable({ rows }: { rows: Split[] }) {
  if (rows.length === 0) return <Empty>Nothing to show for this period.</Empty>;
  return (
    <Table
      head={['', 'Share', 'Orders', 'Revenue']}
      rows={rows.map((row) => [
        row.label,
        pct(row.shareBps),
        nf.format(row.orderCount),
        formatINR(row.revenuePaise),
      ])}
    />
  );
}
