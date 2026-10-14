import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { isStorageConfigured } from '@/lib/storage';
import { PhotoGrid } from '../../../images/photo-grid';
import { PHOTO_ORDER, photosIn } from '../../../images/photo-data';
import { PublishedNote } from '../../../images/published-note';
import { ImageUploader } from '../../../images/image-uploader';
import { variantLabel } from '../../variant-notice';
import { VariantPublishCard } from '../../variant-publish-card';

/*
  One variant's own photos. Every variant gets this page, so adding a photo for
  "Lemon, 900 ml" never involves finding it in a list of ninety-six.

  A photo here is a `ProductImage` row with this `variantId`. The same stored
  picture may also be on other variants (one row each, sharing `publicId`) —
  the "also use for the other sizes" tick does that — so each card says where
  else its picture is used, and deleting takes it off this variant only.
*/
export default async function VariantPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string; variantId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireCatalogueAccess();
  const { productId, variantId } = await params;
  const { notice } = await searchParams;

  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      variants: {
        orderBy: [{ variantName: 'asc' }, { format: 'asc' }, { size: 'asc' }],
        select: { id: true, isActive: true, variantName: true, format: true, size: true },
      },
    },
  });
  const variant = product?.variants.find((entry) => entry.id === variantId);
  if (!product || !variant) notFound();

  const label = variantLabel(variant);
  const variantOptions = product.variants.map((entry) => ({
    id: entry.id,
    label: variantLabel(entry),
    group: entry.variantName,
  }));

  // The other variants with the same name: the other sizes of this fragrance.
  const sameName = variant.variantName
    ? product.variants.filter(
        (entry) => entry.id !== variant.id && entry.variantName === variant.variantName,
      )
    : [];

  // Every photo row of the product, so each card knows where else its picture
  // is used and a delete can say what it leaves.
  const rows = await db.productImage.findMany({
    where: { productId: product.id },
    orderBy: PHOTO_ORDER,
    select: { id: true, url: true, alt: true, publicId: true, variantId: true },
  });
  const photos = photosIn(rows, variant.id);

  return (
    <div>
      <p className="type-caption text-ink-soft">
        <Link href="/admin/products" className="text-signal">
          Products
        </Link>{' '}
        /{' '}
        <Link href={`/admin/products/${product.id}/images`} className="text-signal">
          {product.name}
        </Link>{' '}
        / {label}
      </p>
      <h1 className="mt-4 type-display-sm">Photos of {label}</h1>
      <PublishedNote isActive={product.isActive} slug={product.slug} />
      <p className="mt-4 max-w-2xl type-body text-ink-soft">
        These photos are for this variant only. The first one leads the product page when a
        customer picks {label}, and is the picture shown in the cart.
      </p>

      {isStorageConfigured() ? (
        <ImageUploader
          productId={product.id}
          defaultAlt={`${product.name}, ${label}`}
          variantId={variant.id}
          siblings={
            sameName.length > 0
              ? {
                  label:
                    sameName.length === 1
                      ? `the other ${variant.variantName} variant (${variantLabel(sameName[0])})`
                      : `the other ${sameName.length} ${variant.variantName} variants`,
                  variantIds: sameName.map((entry) => entry.id),
                }
              : undefined
          }
        />
      ) : (
        <p className="mt-8 max-w-2xl rounded-card border border-warning p-6 type-body text-warning">
          Photo uploads are not set up yet. Ask whoever manages the site to connect its Supabase
          storage.
        </p>
      )}

      <h2 className="mt-12 type-heading">Saved photos ({photos.length})</h2>
      {photos.length === 0 ? (
        <p className="mt-4 max-w-2xl type-body text-ink-soft">
          No photos for this variant yet. Until there is one, customers see the product&apos;s
          general photos.
        </p>
      ) : (
        <PhotoGrid
          productId={product.id}
          productIsActive={product.isActive}
          photos={photos}
          hereVariantId={variant.id}
          allRows={rows}
          variants={variantOptions}
        />
      )}

      <VariantPublishCard
        productId={product.id}
        productName={product.name}
        productIsActive={product.isActive}
        variant={variant}
        label={label}
        returnTo="photos"
        noticeKind={notice}
      />

      <p className="mt-12 type-body">
        <Link href={`/admin/products/${product.id}/images#variant-photos`} className="text-signal underline">
          Back to all variants of {product.name}
        </Link>
      </p>
    </div>
  );
}
