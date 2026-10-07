import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { matchesSearch, needsAttention, summarise, type StockRow } from './stock';

const LIST_LIMIT = 500;

/** en-IN grouping, per the admin copy rules. */
const nf = new Intl.NumberFormat('en-IN');

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; show?: string }>;
}) {
  await requireCatalogueAccess();

  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 100);
  const brandId = (params.brand ?? '').trim().slice(0, 64);
  const show = params.show === 'attention' ? 'attention' : 'all';

  const where: Prisma.ProductVariantWhereInput = {
    ...(brandId ? { product: { brandId } } : {}),
  };

  const [variants, brands, locationCount] = await Promise.all([
    db.productVariant.findMany({
      where,
      orderBy: [{ product: { name: 'asc' } }, { size: 'asc' }, { sku: 'asc' }],
      take: LIST_LIMIT,
      include: {
        product: { select: { name: true, slug: true, brand: { select: { name: true } } } },
        inventory: { include: { location: { select: { id: true, name: true, isActive: true } } } },
      },
    }),
    db.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.location.count({ where: { isActive: true } }),
  ]);

  const rows = variants
    .filter((variant) =>
      matchesSearch(
        {
          sku: variant.sku,
          productName: variant.product.name,
          size: variant.size,
          variantName: variant.variantName,
        },
        query,
      ),
    )
    .map((variant) => {
      // An inactive location's stock is unsellable, so it is left out of the
      // totals exactly as `orders.ts` leaves it out of allocation.
      const stock: StockRow[] = variant.inventory
        .filter((row) => row.location.isActive)
        .map((row) => ({
          locationId: row.locationId,
          locationName: row.location.name,
          quantity: row.quantity,
          reserved: row.reserved,
          lowStockAt: row.lowStockAt,
        }));
      return { variant, summary: summarise(stock) };
    })
    .filter(({ summary }) => (show === 'attention' ? needsAttention(summary) : true));

  const attentionCount = rows.filter(({ summary }) => needsAttention(summary)).length;
  const filtered = Boolean(query || brandId || show === 'attention');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-display-sm">Stock</h1>
        <p className="type-caption text-ink-soft">
          {nf.format(locationCount)} active {locationCount === 1 ? 'location' : 'locations'}
        </p>
      </div>
      <p className="mt-4 max-w-2xl type-body text-ink-soft">
        What is counted on the shelf, per size, per location. Held is stock already promised to
        a customer — the shop reserves it during checkout and releases it if they never pay.
      </p>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="block type-caption text-ink-soft">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Stock code, product, size or fragrance"
            className="mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body"
          />
        </div>
        <div>
          <label htmlFor="brand" className="block type-caption text-ink-soft">
            Brand
          </label>
          <select
            id="brand"
            name="brand"
            defaultValue={brandId}
            className="mt-2 rounded-control border border-line bg-white px-4 py-3 type-body"
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="show" className="block type-caption text-ink-soft">
            Show
          </label>
          <select
            id="show"
            name="show"
            defaultValue={show}
            className="mt-2 rounded-control border border-line bg-white px-4 py-3 type-body"
          >
            <option value="all">Everything</option>
            <option value="attention">Needs attention</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-control border border-ink px-6 py-3 type-body font-medium"
        >
          Apply
        </button>
        {filtered && (
          <Link href="/admin/inventory" className="type-body text-signal underline">
            Clear
          </Link>
        )}
      </form>

      {attentionCount > 0 && show !== 'attention' && (
        <p className="mt-6 rounded-control border border-warning px-4 py-3 type-body text-warning">
          {nf.format(attentionCount)}{' '}
          {attentionCount === 1 ? 'size needs' : 'sizes need'} attention — low or never counted.{' '}
          <Link href="/admin/inventory?show=attention" className="underline">
            Show only those
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState filtered={filtered} hasVariants={variants.length > 0} />
      ) : (
        <>
          {/* Wide screens: one scannable table, numbers right-aligned. */}
          <div className="mt-8 hidden overflow-x-auto md:block">
            <table className="w-full min-w-3xl border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-3 type-caption text-ink-soft">Product</th>
                  <th className="py-3 type-caption text-ink-soft">Stock code</th>
                  <th className="py-3 text-right type-caption text-ink-soft">On hand</th>
                  <th className="py-3 text-right type-caption text-ink-soft">Held</th>
                  <th className="py-3 text-right type-caption text-ink-soft">Available</th>
                  <th className="py-3 type-caption text-ink-soft">Status</th>
                  <th className="py-3 type-caption text-ink-soft" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ variant, summary }) => (
                  <tr key={variant.id} className="border-b border-line">
                    <td className="py-3 type-body">
                      {variant.product.name}
                      <span className="block type-caption normal-case text-ink-soft">
                        {variant.product.brand.name} · {variant.size}
                        {variant.variantName ? ` · ${variant.variantName}` : ''}
                      </span>
                    </td>
                    <td className="py-3 type-caption normal-case text-ink-soft">{variant.sku}</td>
                    <td className="py-3 text-right type-body tabular-nums">
                      {summary.notStocked ? '—' : nf.format(summary.onHand)}
                    </td>
                    <td className="py-3 text-right type-body tabular-nums text-ink-soft">
                      {summary.notStocked ? '—' : nf.format(summary.reserved)}
                    </td>
                    <td className="py-3 text-right type-body tabular-nums">
                      {summary.notStocked ? '—' : nf.format(summary.available)}
                    </td>
                    <td className="py-3">
                      <StatusBadge summary={summary} />
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/admin/inventory/${variant.id}`}
                        className="type-body text-signal"
                      >
                        {summary.notStocked ? 'Count it' : 'Update'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow screens: the same rows as cards, per the admin layout rules. */}
          <ul className="mt-8 flex flex-col gap-4 md:hidden">
            {rows.map(({ variant, summary }) => (
              <li key={variant.id} className="rounded-card border border-line p-6">
                <p className="type-body">{variant.product.name}</p>
                <p className="type-caption normal-case text-ink-soft">
                  {variant.product.brand.name} · {variant.size}
                  {variant.variantName ? ` · ${variant.variantName}` : ''}
                </p>
                <p className="mt-1 type-caption normal-case text-ink-soft">{variant.sku}</p>

                <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span className="type-body tabular-nums">
                    {summary.notStocked ? '—' : nf.format(summary.available)}{' '}
                    <span className="type-caption normal-case text-ink-soft">available</span>
                  </span>
                  {!summary.notStocked && summary.reserved > 0 && (
                    <span className="type-caption normal-case text-ink-soft">
                      {nf.format(summary.reserved)} held
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-4">
                  <StatusBadge summary={summary} />
                  <Link href={`/admin/inventory/${variant.id}`} className="type-body text-signal">
                    {summary.notStocked ? 'Count it' : 'Update'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-8 type-caption text-ink-soft">
            {nf.format(rows.length)} of {nf.format(variants.length)}{' '}
            {variants.length === 1 ? 'size' : 'sizes'}
            {variants.length >= LIST_LIMIT ? ` (first ${nf.format(LIST_LIMIT)})` : ''}
          </p>
        </>
      )}
    </div>
  );
}

function StatusBadge({ summary }: { summary: ReturnType<typeof summarise> }) {
  if (summary.notStocked) {
    return (
      <span className="rounded-control border border-line px-3 py-1 type-caption text-ink-soft">
        Never counted
      </span>
    );
  }
  if (summary.outOfStock) {
    return (
      <span className="rounded-control border border-warning px-3 py-1 type-caption text-warning">
        Out of stock
      </span>
    );
  }
  if (summary.lowLocations.length > 0) {
    return (
      <span className="rounded-control border border-warning px-3 py-1 type-caption text-warning">
        Low at {summary.lowLocations.map((l) => l.locationName).join(', ')}
      </span>
    );
  }
  return (
    <span className="rounded-control border border-line px-3 py-1 type-caption text-ink-soft">
      In stock
    </span>
  );
}

function EmptyState({ filtered, hasVariants }: { filtered: boolean; hasVariants: boolean }) {
  if (filtered) {
    return (
      <p className="mt-12 type-body text-ink-soft">
        Nothing matches that.{' '}
        <Link href="/admin/inventory" className="text-signal underline">
          Clear the filters
        </Link>{' '}
        to see every size.
      </p>
    );
  }
  if (!hasVariants) {
    return (
      <p className="mt-12 type-body text-ink-soft">
        No sizes to stock yet. Stock is counted per size, so{' '}
        <Link href="/admin/products/quick-add" className="text-signal underline">
          add a product
        </Link>{' '}
        first and its sizes will appear here.
      </p>
    );
  }
  return <p className="mt-12 type-body text-ink-soft">Nothing to show.</p>;
}
