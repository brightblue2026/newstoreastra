import Link from '@/components/Link';
import { OrderStatus } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireAdminAccess } from '@/lib/session';
import { canManageCatalogue } from '@/lib/roles';
import { summarise } from './inventory/stock';

const nf = new Intl.NumberFormat('en-IN');

/**
 * The dashboard.
 *
 * Every tile answers "is there anything for me to do?" and links to the place
 * the answer is acted on. A tile showing zero is still worth printing — "no
 * orders waiting" is information — but a tile is only queried and shown when
 * the signed-in role could do something about it.
 */
export default async function AdminHomePage() {
  const user = await requireAdminAccess();
  const catalogue = canManageCatalogue(user.role);

  const [awaitingFulfilment, pendingPayment, draftProducts, liveProducts, stockRows] =
    await Promise.all([
      db.order.count({ where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.PACKED] } } }),
      db.order.count({ where: { status: OrderStatus.PENDING_PAYMENT } }),
      catalogue ? db.product.count({ where: { isActive: false } }) : Promise.resolve(0),
      catalogue ? db.product.count({ where: { isActive: true } }) : Promise.resolve(0),
      catalogue
        ? db.inventory.findMany({
            where: { location: { isActive: true } },
            select: { variantId: true, quantity: true, reserved: true, lowStockAt: true },
          })
        : Promise.resolve([]),
    ]);

  const variantCount = catalogue ? await db.productVariant.count() : 0;

  // Grouped per variant, because both questions the tiles ask — "is it low?"
  // and "is it empty?" — are about the variant as a whole, not one shelf. A
  // location sitting at zero because it never carries the item is not low; see
  // `carriesStock` in `inventory/stock.ts`.
  const byVariant = new Map<string, typeof stockRows>();
  for (const row of stockRows) {
    byVariant.set(row.variantId, [...(byVariant.get(row.variantId) ?? []), row]);
  }

  let restockCount = 0;
  for (const rows of byVariant.values()) {
    const summary = summarise(
      rows.map((row) => ({ ...row, locationId: '', locationName: '' })),
    );
    if (summary.outOfStock || summary.lowLocations.length > 0) restockCount += 1;
  }

  // A variant counted nowhere has no `Inventory` row at all, so "never counted"
  // is simply the variants that never appeared in that grouping.
  const neverCounted = variantCount - byVariant.size;

  return (
    <div>
      <h1 className="type-display-sm">Dashboard</h1>
      <p className="mt-4 type-body-lg text-ink-soft">
        Signed in as {user.email} · {user.role.toLowerCase()}.
      </p>

      <div className="mt-12 grid gap-6 border-t border-line pt-12 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          label="Orders to pack"
          value={nf.format(awaitingFulfilment)}
          note={awaitingFulfilment === 0 ? 'Nothing waiting.' : 'Paid and waiting to go out.'}
          href="/admin/orders"
          action="Open orders"
          alert={awaitingFulfilment > 0}
        />
        <Tile
          label="Checkouts not paid"
          value={nf.format(pendingPayment)}
          note={
            pendingPayment === 0
              ? 'No abandoned checkouts.'
              : 'Started but never paid. Their stock stays held until they expire.'
          }
          href="/admin/orders"
          action="Open orders"
        />

        {catalogue && (
          <>
            <Tile
              label="Live products"
              value={nf.format(liveProducts)}
              note={
                draftProducts > 0
                  ? `${nf.format(draftProducts)} still in draft.`
                  : 'Everything is published.'
              }
              href="/admin/products"
              action="Open products"
            />
            <Tile
              label="Needs restocking"
              value={nf.format(restockCount)}
              note={
                restockCount === 0
                  ? 'Nothing at or below its alert level.'
                  : 'Low or empty at a branch that carries it.'
              }
              href="/admin/inventory?show=attention"
              action="Open stock"
              alert={restockCount > 0}
            />
            <Tile
              label="Never counted"
              value={nf.format(Math.max(0, neverCounted))}
              note={
                neverCounted <= 0
                  ? 'Every size has a stock figure.'
                  : 'Sizes with no stock figure anywhere. The shop cannot sell these.'
              }
              href="/admin/inventory?show=attention"
              action="Open stock"
              alert={neverCounted > 0}
            />
            <Tile
              label="Add a product"
              value=""
              note="Five short steps. Nothing goes live until you publish it."
              href="/admin/products/quick-add"
              action="Start"
            />
          </>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  href,
  action,
  alert,
}: {
  label: string;
  value: string;
  note: string;
  href: string;
  action: string;
  alert?: boolean;
}) {
  return (
    <section
      className={`flex flex-col rounded-card border p-6 ${alert ? 'border-warning' : 'border-line'}`}
    >
      <h2 className="type-caption text-ink-soft">{label}</h2>
      {value !== '' && (
        <p className={`mt-3 type-display-sm tabular-nums ${alert ? 'text-warning' : ''}`}>{value}</p>
      )}
      <p className="mt-2 type-body text-ink-soft">{note}</p>
      <Link href={href} className="mt-6 type-body text-signal">
        {action} →
      </Link>
    </section>
  );
}
