import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { setStockAction } from '../actions';
import { StockForm, type LocationRow } from '../stock-form';
import { summarise, type StockRow } from '../stock';

const nf = new Intl.NumberFormat('en-IN');

export default async function VariantStockPage({
  params,
}: {
  params: Promise<{ variantId: string }>;
}) {
  await requireCatalogueAccess();
  const { variantId } = await params;

  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: { select: { id: true, name: true, brand: { select: { name: true } } } },
      inventory: true,
    },
  });
  if (!variant) notFound();

  const locations = await db.location.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  const byLocation = new Map(variant.inventory.map((row) => [row.locationId, row]));

  const rows: LocationRow[] = locations.map((location) => {
    const stock = byLocation.get(location.id);
    return {
      locationId: location.id,
      locationName: location.name,
      address: `${location.address} · ${location.pincode}`,
      quantity: String(stock?.quantity ?? 0),
      lowStockAt: String(stock?.lowStockAt ?? 10),
      reserved: stock?.reserved ?? 0,
      counted: Boolean(stock),
    };
  });

  const stockRows: StockRow[] = locations
    .map((location) => {
      const stock = byLocation.get(location.id);
      return stock
        ? {
            locationId: location.id,
            locationName: location.name,
            quantity: stock.quantity,
            reserved: stock.reserved,
            lowStockAt: stock.lowStockAt,
          }
        : null;
    })
    .filter((row): row is StockRow => row !== null);

  const summary = summarise(stockRows);
  const title = [variant.size, variant.variantName].filter(Boolean).join(' · ');

  return (
    <div>
      <Link href="/admin/inventory" className="type-body text-signal">
        ← All stock
      </Link>

      <h1 className="mt-4 type-display-sm">{variant.product.name}</h1>
      <p className="mt-2 type-body-lg text-ink-soft">
        {variant.product.brand.name} · {title}
      </p>
      <p className="mt-1 type-caption normal-case text-ink-soft">{variant.sku}</p>

      <div className="mt-8 flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-6">
        <Figure label="On hand" value={summary.notStocked ? '—' : nf.format(summary.onHand)} />
        <Figure label="Held for customers" value={summary.notStocked ? '—' : nf.format(summary.reserved)} />
        <Figure label="Available to sell" value={summary.notStocked ? '—' : nf.format(summary.available)} />
      </div>

      {summary.outOfStock && (
        <p className="mt-6 rounded-control border border-warning px-4 py-3 type-body text-warning">
          Out of stock everywhere. The shop cannot sell this size until it is restocked.
        </p>
      )}
      {summary.lowLocations.length > 0 && (
        <p className="mt-6 rounded-control border border-warning px-4 py-3 type-body text-warning">
          Running low at {summary.lowLocations.map((l) => l.locationName).join(', ')}.
        </p>
      )}

      <h2 className="mt-12 type-heading">By location</h2>
      <p className="mt-2 max-w-2xl type-body text-ink-soft">
        Enter what is actually on the shelf at each place. Leave a location at 0 if it does not
        carry this size.
      </p>

      <StockForm action={setStockAction.bind(null, variant.id)} rows={rows} />

      <p className="mt-8 type-caption normal-case text-ink-soft">
        Every change is recorded in the audit log against the person who made it.
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-caption text-ink-soft">{label}</p>
      <p className="mt-1 type-subhead tabular-nums">{value}</p>
    </div>
  );
}
