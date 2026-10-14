import Link from '@/components/Link';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { setProductActiveAction } from './actions';
import { PublishButton } from './publish-button';
import { joinList, publishBlockers } from './publish-check';

/**
 * What the last action did, said back in words. The address carries only the
 * kind of notice and a product id; the wording and the name come from here and
 * from the database, so a crafted link cannot put text on this page.
 */
function noticeFor(
  kind: string | undefined,
  product: { name: string; slug: string; missing: string[] } | undefined,
): { text: string; storeHref?: string; nextHref?: string; nextLabel?: string } | null {
  if (!product) return null;
  switch (kind) {
    case 'published':
      return {
        text: `Published. "${product.name}" is now on the store.`,
        storeHref: `/products/${product.slug}`,
      };
    case 'unpublished':
      return { text: `Unpublished. "${product.name}" is no longer on the store. Nothing was deleted.` };
    case 'updated':
      return { text: `Saved. Your changes to "${product.name}" are stored.` };
    case 'created':
      return {
        text:
          product.missing.length > 0
            ? `Saved. "${product.name}" is stored as a draft and is not on the store yet. It still needs ${joinList(product.missing)} before it can be published.`
            : `Saved. "${product.name}" is stored as a draft. Press Publish in its row to put it on the store.`,
      };
    default:
      return null;
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ publishError?: string; notice?: string; product?: string }>;
}) {
  await requireCatalogueAccess();
  const { publishError, notice: noticeKind, product: noticeProductId } = await searchParams;

  const products = await db.product.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      brand: true,
      category: true,
      variants: { select: { id: true, isActive: true, images: { select: { id: true } } } },
      images: true,
    },
  });

  const rows = products.map((product) => ({ product, missing: publishBlockers(product) }));
  const noticeRow = rows.find((row) => row.product.id === noticeProductId);
  const notice = noticeFor(
    noticeKind,
    noticeRow && { name: noticeRow.product.name, slug: noticeRow.product.slug, missing: noticeRow.missing },
  );

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

      {notice && !publishError && (
        <p
          role="status"
          className="mt-6 rounded-control border border-success px-4 py-3 type-body text-success"
        >
          {notice.text}
          {notice.storeHref && (
            <>
              {' '}
              <a href={notice.storeHref} target="_blank" rel="noreferrer" className="underline">
                View it on the store
              </a>
            </>
          )}
        </p>
      )}

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
                <th className="py-3 pr-4 type-caption text-ink-soft">Name</th>
                <th className="py-3 pr-4 type-caption text-ink-soft">Brand</th>
                <th className="py-3 pr-4 type-caption text-ink-soft">Category</th>
                <th className="py-3 pr-4 type-caption text-ink-soft">Variants</th>
                <th className="py-3 pr-4 type-caption text-ink-soft">Status</th>
                <th className="py-3 type-caption text-ink-soft" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, missing }) => (
                <tr key={product.id} className="border-b border-line">
                  <td className="py-3 pr-4 type-body">{product.name}</td>
                  <td className="py-3 pr-4 type-body text-ink-soft">{product.brand.name}</td>
                  <td className="py-3 pr-4 type-body text-ink-soft">{product.category.name}</td>
                  <td className="py-3 pr-4 type-body text-ink-soft">{product.variants.length}</td>
                  <td className="py-3 pr-4 type-body">
                    <span
                      className={
                        product.isActive
                          ? 'rounded-control border border-success px-2 py-1 type-caption text-success'
                          : 'rounded-control border border-line px-2 py-1 type-caption text-ink-soft'
                      }
                    >
                      {product.isActive ? 'Published' : 'Draft'}
                    </span>
                    {!product.isActive && (
                      <p className="mt-2 max-w-56 type-caption normal-case text-ink-soft">
                        {missing.length > 0 ? `Needs ${joinList(missing)}` : 'Ready to publish'}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
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
                        Images ({new Set(product.images.map((image) => image.publicId)).size})
                      </Link>
                      <Link href={`/admin/products/${product.id}`} className="type-body text-signal">
                        Edit
                      </Link>
                      <form
                        action={setProductActiveAction.bind(null, product.id, !product.isActive)}
                      >
                        <PublishButton isActive={product.isActive} />
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
