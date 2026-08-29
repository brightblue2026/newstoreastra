import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { ImageCard } from './image-card';
import { ImageUploader } from './image-uploader';

export default async function ProductImagesPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await requireCatalogueAccess();
  const { productId } = await params;

  const product = await db.product.findUnique({
    where: { id: productId },
    include: { images: { orderBy: { sortOrder: 'asc' } } },
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
      <h1 className="mt-4 type-display-sm">Images</h1>

      <ImageUploader productId={product.id} />

      {product.images.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          No images yet. This product cannot publish without at least one.
        </p>
      ) : (
        <>
          <p className="mt-12 type-caption text-ink-soft">
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
    </div>
  );
}
