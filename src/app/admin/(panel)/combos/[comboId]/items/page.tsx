import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatINR, sumPaise } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { deleteComboItemAction } from './actions';

export default async function ComboItemsPage({
  params,
}: {
  params: Promise<{ comboId: string }>;
}) {
  await requireCatalogueAccess();
  const { comboId } = await params;

  const combo = await db.combo.findUnique({
    where: { id: comboId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  if (!combo) notFound();

  const pricedItems = combo.items.filter((item) => item.variant.pricePaise !== null);
  const hasUnpriced = pricedItems.length !== combo.items.length;
  const componentSum =
    combo.items.length === 0
      ? 0
      : sumPaise(...pricedItems.map((item) => item.variant.pricePaise! * item.quantity));
  // Can go negative — a combo priced above its component sum is a pricing
  // mistake, not an impossible state, and the page must show it rather than
  // crash. `formatINR` asserts non-negative, so the sign is handled here.
  const saving = componentSum - combo.pricePaise;
  const savingPercent = componentSum > 0 ? Math.round((saving / componentSum) * 100) : 0;
  const savingLabel =
    saving < 0
      ? `−${formatINR(Math.abs(saving))} (priced above components)`
      : `${formatINR(saving)} (${savingPercent}%)`;

  return (
    <div>
      <p className="type-caption text-ink-soft">
        <Link href="/admin/combos" className="text-signal">
          Combos
        </Link>{' '}
        / {combo.name}
      </p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="type-display-sm">Components</h1>
        <Link
          href={`/admin/combos/${combo.id}/items/new`}
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
        >
          Add component
        </Link>
      </div>

      <div className="mt-8 rounded-card border border-line p-6">
        <dl className="grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="type-caption text-ink-soft">Component sum</dt>
            <dd className="mt-2 type-heading" data-price>
              {hasUnpriced ? '—' : formatINR(componentSum)}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-ink-soft">Package price</dt>
            <dd className="mt-2 type-heading" data-price>
              {formatINR(combo.pricePaise)}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-ink-soft">Saving</dt>
            <dd className="mt-2 type-heading" data-price>
              {hasUnpriced ? '—' : savingLabel}
            </dd>
          </div>
        </dl>
        {hasUnpriced && (
          <p className="mt-4 type-caption normal-case text-warning">
            One or more components has no price set — saving cannot be calculated yet.
          </p>
        )}
      </div>

      {combo.items.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          No components yet. This combo cannot publish without at least one.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-3 type-caption text-ink-soft">Variant</th>
                <th className="py-3 type-caption text-ink-soft">Quantity</th>
                <th className="py-3 type-caption text-ink-soft">Choice slot</th>
                <th className="py-3 type-caption text-ink-soft">Price</th>
                <th className="py-3 type-caption text-ink-soft" />
              </tr>
            </thead>
            <tbody>
              {combo.items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-3 type-body">
                    {item.variant.product.name}
                    {item.variant.variantName ? ` — ${item.variant.variantName}` : ''}{' '}
                    <span className="type-mono text-ink-soft">({item.variant.sku})</span>
                  </td>
                  <td className="py-3 type-body text-ink-soft">{item.quantity}</td>
                  <td className="py-3 type-body text-ink-soft">
                    {item.isChoice ? (item.choiceOf.length > 0 ? 'Restricted' : 'Any') : '—'}
                  </td>
                  <td className="py-3 type-mono" data-price>
                    {item.variant.pricePaise === null ? '—' : formatINR(item.variant.pricePaise)}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-4">
                      <Link
                        href={`/admin/combos/${combo.id}/items/${item.id}`}
                        className="type-body text-signal"
                      >
                        Edit
                      </Link>
                      <form action={deleteComboItemAction.bind(null, combo.id, item.id)}>
                        <button type="submit" className="type-body text-ink-soft underline">
                          Remove
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
