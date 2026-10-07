import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isStorageConfigured } from '@/lib/storage';
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

      {/* Told before a file is chosen, not after. The uploader used to render
          as though it worked and only failed once the photo had been picked. */}
      {isStorageConfigured() ? (
        <ImageUploader productId={product.id} />
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
