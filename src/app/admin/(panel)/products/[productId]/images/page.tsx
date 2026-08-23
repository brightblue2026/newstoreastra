import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { deleteProductImageAction } from './actions';
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
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {product.images.map((image) => (
            <div key={image.id} className="rounded-card border border-line p-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-control bg-paper">
                <Image
                  src={image.url}
                  alt={image.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 type-caption text-ink-soft">{image.alt}</p>
              <form action={deleteProductImageAction.bind(null, product.id, image.id)} className="mt-2">
                <button type="submit" className="type-caption text-warning underline">
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
