import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatPrice } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { setVariantActiveAction } from './actions';

export default async function VariantsPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await requireCatalogueAccess();
  const { productId } = await params;

  const product = await db.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { sku: 'asc' } } },
  });
  if (!product) notFound();

  return (
    <div>
      <p className="type-caption text-ink-soft">
        <Link href="/admin/products" className="text-signal">
          Products
        </Link>{' '}
        / {product.name}
      </p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="type-display-sm">Variants</h1>
        <Link
          href={`/admin/products/${product.id}/variants/new`}
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
        >
          New variant
        </Link>
      </div>

      {product.variants.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          No variants yet. This product cannot publish without at least one.
        </p>
      ) : (
        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-3 type-caption text-ink-soft">SKU</th>
              <th className="py-3 type-caption text-ink-soft">Variant</th>
              <th className="py-3 type-caption text-ink-soft">Size</th>
              <th className="py-3 type-caption text-ink-soft">Price</th>
              <th className="py-3 type-caption text-ink-soft">Status</th>
              <th className="py-3 type-caption text-ink-soft" />
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr key={variant.id} className="border-b border-line">
                <td className="py-3 type-mono text-ink-soft">{variant.sku}</td>
                <td className="py-3 type-body">
                  {variant.variantHex && (
                    <span
                      aria-hidden
                      className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                      style={{ backgroundColor: variant.variantHex }}
                    />
                  )}
                  {variant.variantName ?? '—'}
                </td>
                <td className="py-3 type-body text-ink-soft">
                  {variant.size}
                  {variant.format ? ` · ${variant.format}` : ''}
                </td>
                <td className="py-3 type-mono" data-price>
                  {formatPrice(variant.pricePaise)}
                </td>
                <td className="py-3 type-body">{variant.isActive ? 'Active' : 'Inactive'}</td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-4">
                    <Link
                      href={`/admin/products/${product.id}/variants/${variant.id}`}
                      className="type-body text-signal"
                    >
                      Edit
                    </Link>
                    <form
                      action={setVariantActiveAction.bind(
                        null,
                        product.id,
                        variant.id,
                        !variant.isActive,
                      )}
                    >
                      <button type="submit" className="type-body text-ink-soft underline">
                        {variant.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
