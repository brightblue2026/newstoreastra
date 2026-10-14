import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { isStorageConfigured } from '@/lib/storage';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { setProductActiveAction } from '../../actions';
import { PublishButton } from '../../publish-button';
import { joinList, publishBlockers } from '../../publish-check';
import { ImageCard } from './image-card';
import { ImageUploader } from './image-uploader';
import { variantLabel } from '../variants/variant-notice';

export default async function ProductImagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireCatalogueAccess();
  const { productId } = await params;
  const { created } = await searchParams;

  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      // The product's general photos. A variant's own photos are listed apart.
      images: { where: { variantId: null }, orderBy: { sortOrder: 'asc' } },
      variants: {
        orderBy: [{ variantName: 'asc' }, { format: 'asc' }, { size: 'asc' }],
        select: {
          id: true,
          isActive: true,
          variantName: true,
          format: true,
          size: true,
          images: { select: { id: true } },
        },
      },
    },
  });
  if (!product) notFound();

  const missing = publishBlockers(product);

  const variantPhotoCount = product.variants.reduce((sum, variant) => sum + variant.images.length, 0);

  return (
    <div>
      <p className="type-caption text-ink-soft">
        <Link href="/admin/products" className="text-signal">
          Products
        </Link>{' '}
        / {product.name}
      </p>
      <h1 className="mt-4 type-display-sm">Photos</h1>
      {product.variants.length > 0 && (
        <p className="mt-4 max-w-2xl type-body text-ink-soft">
          These are photos of the product as a whole. Each variant also has its own photo page:{' '}
          <a href="#variant-photos" className="text-signal underline">
            photos for each variant
          </a>
          .
        </p>
      )}

      {/* Arriving here straight from "Save and add photos": say the save
          happened before asking for anything else. */}
      {created && (
        <p
          role="status"
          className="mt-6 max-w-2xl rounded-control border border-success px-4 py-3 type-body text-success"
        >
          Saved. &ldquo;{product.name}&rdquo; is stored as a draft with {product.variants.length}{' '}
          {product.variants.length === 1 ? 'variant' : 'variants'}. It is not on the store yet. Add
          its photos here, then publish it.
        </p>
      )}

      {/* Told before a file is chosen, not after. The uploader used to render
          as though it worked and only failed once the photo had been picked. */}
      {isStorageConfigured() ? (
        <ImageUploader productId={product.id} defaultAlt={product.name} />
      ) : (
        <div className="mt-8 rounded-card border border-warning p-6">
          <p className="type-body text-warning">Photo uploads are not set up yet.</p>
          <p className="mt-2 type-body text-ink-soft">
            Photos are stored with Supabase, and this site has no storage connected
            yet. Until it does, photos cannot be added and no product can be
            published — publishing needs at least one image.
          </p>
          <p className="mt-4 type-caption normal-case text-ink-soft">
            Whoever manages the site needs to set <code className="type-mono">SUPABASE_URL</code> and{' '}
            <code className="type-mono">SUPABASE_SERVICE_ROLE_KEY</code>, restart it, then run{' '}
            <code className="type-mono">pnpm storage:setup</code> once to create the bucket the
            photos go in.
          </p>
        </div>
      )}

      <h2 className="mt-12 type-heading">Saved photos ({product.images.length})</h2>
      {product.images.length === 0 ? (
        <p className="mt-4 type-body text-ink-soft">
          {variantPhotoCount === 0
            ? 'No photos saved yet. This product cannot be published without at least one.'
            : 'No photo of the product as a whole yet. Cards and search results use a variant photo until there is one.'}
        </p>
      ) : (
        <>
          <p className="mt-4 type-caption text-ink-soft">
            The cover image — first below — is what the storefront shows on cards and search
            results. Use the arrows to change which one leads.
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-3">
            {product.images.map((image, index) => (
              <ImageCard
                key={image.id}
                productId={product.id}
                image={image}
                isCover={index === 0}
                isFirst={index === 0}
                isLast={index === product.images.length - 1}
              />
            ))}
          </div>
        </>
      )}

      {product.variants.length > 0 && (
        <>
          <h2 id="variant-photos" className="mt-12 scroll-mt-6 type-heading">
            Photos for each variant
          </h2>
          <p className="mt-4 max-w-2xl type-caption text-ink-soft">
            A variant&apos;s own photo leads the product page when a customer picks that variant,
            and is the picture shown in the cart. A variant without one uses the photos above.
          </p>
          <ul className="mt-4 max-w-2xl border-t border-line">
            {product.variants.map((variant) => (
              <li
                key={variant.id}
                className="flex items-center justify-between gap-4 border-b border-line py-3"
              >
                <span className="min-w-0 type-body">{variantLabel(variant)}</span>
                <Link
                  href={`/admin/products/${product.id}/variants/${variant.id}/photos`}
                  className="shrink-0 type-body text-signal underline"
                >
                  {variant.images.length === 0
                    ? 'Add photos'
                    : variant.images.length === 1
                      ? '1 photo'
                      : `${variant.images.length} photos`}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* The next step, on the screen the photos were added from, so nobody has
          to go looking for where a product is put on the store. */}
      <div className="mt-12 max-w-2xl rounded-card border border-line p-6">
        <h2 className="type-heading">
          {product.isActive ? 'Published' : missing.length > 0 ? 'Not ready to publish' : 'Ready to publish'}
        </h2>
        {product.isActive ? (
          <p className="mt-2 type-body text-ink-soft">
            This product is on the store.{' '}
            <a
              href={`/products/${product.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-signal underline"
            >
              View it on the store
            </a>
          </p>
        ) : missing.length > 0 ? (
          <p className="mt-2 type-body text-ink-soft">
            It still needs {joinList(missing)}.{' '}
            {missing.some((item) => item !== 'a photo') && (
              <>
                Photos are added above; the{' '}
                <Link href={`/admin/products/${product.id}`} className="text-signal underline">
                  product details
                </Link>{' '}
                and{' '}
                <Link href={`/admin/products/${product.id}/variants`} className="text-signal underline">
                  variants
                </Link>{' '}
                have their own pages.
              </>
            )}
          </p>
        ) : (
          <p className="mt-2 type-body text-ink-soft">
            Everything needed is saved. Publishing puts this product on the store straight away.
          </p>
        )}
        {(product.isActive || missing.length === 0) && (
          <form action={setProductActiveAction.bind(null, product.id, !product.isActive)} className="mt-4">
            <PublishButton isActive={product.isActive} />
          </form>
        )}
      </div>
    </div>
  );
}
