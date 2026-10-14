import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { isStorageConfigured } from '@/lib/storage';
import { ImageCard } from '../../../images/image-card';
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
      isActive: true,
      variants: {
        orderBy: [{ variantName: 'asc' }, { format: 'asc' }, { size: 'asc' }],
        select: { id: true, isActive: true, variantName: true, format: true, size: true },
      },
    },
  });
  const variant = product?.variants.find((entry) => entry.id === variantId);
  if (!product || !variant) notFound();

  const labels = new Map(product.variants.map((entry) => [entry.id, variantLabel(entry)]));
  const label = variantLabel(variant);

  // The other variants with the same name: the other sizes of this fragrance.
  const sameName = variant.variantName
    ? product.variants.filter(
        (entry) => entry.id !== variant.id && entry.variantName === variant.variantName,
      )
    : [];

  const photos = await db.productImage.findMany({
    where: { productId: product.id, variantId: variant.id },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, url: true, alt: true, publicId: true },
  });
  const shared = await db.productImage.findMany({
    where: {
      productId: product.id,
      publicId: { in: photos.map((photo) => photo.publicId) },
      variantId: { not: variant.id },
    },
    select: { publicId: true, variantId: true },
  });
  const alsoShownFor = (publicId: string): string | null => {
    const others = shared
      .filter((row) => row.publicId === publicId && row.variantId)
      .map((row) => labels.get(row.variantId!) ?? 'a removed variant');
    if (others.length === 0) return null;
    return others.length <= 3
      ? others.join(', ')
      : `${others.slice(0, 2).join(', ')} and ${others.length - 2} more`;
  };

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
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          {photos.map((photo) => (
            <ImageCard
              key={photo.id}
              productId={product.id}
              image={photo}
              isCover={false}
              isFirst
              isLast
              variantPhoto={{ alsoShownFor: alsoShownFor(photo.publicId) }}
            />
          ))}
        </div>
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
