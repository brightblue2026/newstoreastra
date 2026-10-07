import Link from 'next/link';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { setProductActiveAction } from './actions';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ publishError?: string }>;
}) {
  await requireCatalogueAccess();
  const { publishError } = await searchParams;

  const products = await db.product.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { brand: true, category: true, variants: true, images: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="type-display-sm">Products</h1>
        <div className="flex items-center gap-6">
          <Link href="/admin/products/new" className="type-body text-signal">
            Full form
          </Link>
          <Link
            href="/admin/products/quick-add"
            className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
          >
            Add a product
          </Link>
        </div>
      </div>

      {publishError && (
        <p role="alert" className="mt-6 rounded-control border border-warning px-4 py-3 type-body text-warning">
          {publishError}
        </p>
      )}

      {products.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          No products yet.{' '}
          <Link href="/admin/products/quick-add" className="text-signal underline">
            Add your first one
          </Link>{' '}
          — five short steps, and nothing goes live until you publish it.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-3 type-caption text-ink-soft">Name</th>
                <th className="py-3 type-caption text-ink-soft">Brand</th>
                <th className="py-3 type-caption text-ink-soft">Category</th>
                <th className="py-3 type-caption text-ink-soft">Variants</th>
                <th className="py-3 type-caption text-ink-soft">Status</th>
                <th className="py-3 type-caption text-ink-soft" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-line">
                  <td className="py-3 type-body">{product.name}</td>
                  <td className="py-3 type-body text-ink-soft">{product.brand.name}</td>
                  <td className="py-3 type-body text-ink-soft">{product.category.name}</td>
                  <td className="py-3 type-body text-ink-soft">{product.variants.length}</td>
                  <td className="py-3 type-body">{product.isActive ? 'Published' : 'Draft'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-4">
                      <Link
                        href={`/admin/products/${product.id}/variants`}
                        className="type-body text-signal"
                      >
                        Variants
                      </Link>
                      <Link
                        href={`/admin/products/${product.id}/images`}
                        className="type-body text-signal"
                      >
                        Images ({product.images.length})
                      </Link>
                      <Link href={`/admin/products/${product.id}`} className="type-body text-signal">
                        Edit
                      </Link>
                      <form
                        action={setProductActiveAction.bind(null, product.id, !product.isActive)}
                      >
                        <button type="submit" className="type-body text-ink-soft underline">
                          {product.isActive ? 'Unpublish' : 'Publish'}
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
