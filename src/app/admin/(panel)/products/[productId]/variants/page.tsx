import Image from 'next/image';
import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatPrice } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { PublishButton } from '../../publish-button';
import { isStorageConfigured } from '@/lib/storage';
import { setAllVariantsActiveAction, setVariantActiveAction } from './actions';
import { QuickPhotoButton } from './quick-photo-button';
import { variantLabel, variantNotice } from './variant-notice';

export default async function VariantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ notice?: string; variant?: string }>;
}) {
  await requireCatalogueAccess();
  const { productId } = await params;
  const { notice: noticeKind, variant: noticeVariantId } = await searchParams;

  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        orderBy: { sku: 'asc' },
        include: {
          _count: { select: { images: true } },
          // The photo customers see first for this variant.
          images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { url: true, alt: true } },
        },
      },
    },
  });
  if (!product) notFound();

  const noticeVariant = product.variants.find((variant) => variant.id === noticeVariantId);
  const notice = variantNotice(noticeKind, {
    label: noticeVariant ? variantLabel(noticeVariant) : undefined,
    productName: product.name,
    productIsActive: product.isActive,
  });
  const canUpload = isStorageConfigured();
  const published = product.variants.filter((variant) => variant.isActive).length;
  const drafts = product.variants.length - published;

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
        <div className="flex flex-wrap items-center justify-end gap-4">
          {/* Shown only when pressing it would change something. */}
          {drafts > 0 && (
            <form action={setAllVariantsActiveAction.bind(null, product.id, true)}>
              <PublishButton isActive={false} all />
            </form>
          )}
          {published > 0 && (
            <form action={setAllVariantsActiveAction.bind(null, product.id, false)}>
              <PublishButton isActive all />
            </form>
          )}
          <Link
            href={`/admin/products/${product.id}/variants/new`}
            className="rounded-control border border-line px-4 py-2 type-body text-ink hover:bg-sky"
          >
            New variant
          </Link>
        </div>
      </div>

      {product.variants.length > 0 && (
        <p className="mt-4 max-w-2xl type-body text-ink-soft">
          {published} of {product.variants.length} published.{' '}
          Add a photo and publish each variant from its row.{' '}
          {product.isActive
            ? 'Customers can choose only the published ones.'
            : `"${product.name}" is still a draft, so none of them is on the store yet. Published variants appear once the product is published.`}
        </p>
      )}

      {notice && (
        <p
          role={notice.tone === 'warning' ? 'alert' : 'status'}
          className={`mt-6 rounded-control border px-4 py-3 type-body ${
            notice.tone === 'warning' ? 'border-warning text-warning' : 'border-success text-success'
          }`}
        >
          {notice.text}
        </p>
      )}

      {product.variants.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          No variants yet. This product cannot publish without at least one.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-3 pr-4 type-caption text-ink-soft">Photo</th>
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
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/products/${product.id}/variants/${variant.id}/photos`}
                      aria-label={`Photos of ${variantLabel(variant)}`}
                      className="relative block h-14 w-14 overflow-hidden rounded-control border border-line bg-paper"
                    >
                      {variant.images[0] ? (
                        <Image
                          src={variant.images[0].url}
                          alt={variant.images[0].alt}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-center type-caption normal-case text-ink-soft">
                          None
                        </span>
                      )}
                    </Link>
                  </td>
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
                  <td className="py-3 type-body">
                    <span
                      className={
                        variant.isActive
                          ? 'rounded-control border border-success px-2 py-1 type-caption text-success'
                          : 'rounded-control border border-line px-2 py-1 type-caption text-ink-soft'
                      }
                    >
                      {variant.isActive ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
                      {canUpload && (
                        <QuickPhotoButton
                          productId={product.id}
                          variantId={variant.id}
                          alt={`${product.name}, ${variantLabel(variant)}`}
                        />
                      )}
                      <Link
                        href={`/admin/products/${product.id}/variants/${variant.id}`}
                        className="type-body text-signal"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/products/${product.id}/variants/${variant.id}/photos`}
                        className="type-body text-signal"
                      >
                        Photos ({variant._count.images})
                      </Link>
                      <form
                        action={setVariantActiveAction.bind(
                          null,
                          product.id,
                          variant.id,
                          !variant.isActive,
                          'list',
                        )}
                      >
                        <PublishButton isActive={variant.isActive} />
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
