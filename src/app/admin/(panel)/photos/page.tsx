import Image from 'next/image';
import Link from '@/components/Link';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import {
  PHOTO_FILTERS,
  emptyMessage,
  inFilter,
  matchesSearch,
  parseFilter,
  summarise,
  type PhotoFilter,
} from './summary';

/*
  Every product's photos on one page: which have them, which still need them,
  and a way into each. With seventy-odd products, "which ones still need a
  photo?" should not mean opening each one.
*/
export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; q?: string }>;
}) {
  await requireCatalogueAccess();
  const { show, q } = await searchParams;
  const filter = parseFilter(show);
  const query = (q ?? '').trim().slice(0, 100);

  // Only what the list shows: this page runs on every visit, under a tight
  // CPU allowance.
  const products = await db.product.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      isActive: true,
      brand: { select: { name: true } },
      images: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { url: true, alt: true, publicId: true, variantId: true },
      },
      variants: { select: { _count: { select: { images: true } } } },
    },
  });

  const all = products.map((product) => ({
    brand: product.brand.name,
    ...summarise({
      ...product,
      variants: product.variants.map((variant) => ({ photoCount: variant._count.images })),
    }),
  }));
  const searched = all.filter((product) => matchesSearch(product, query));
  const shown = searched.filter((product) => inFilter(product, filter));
  const countFor = (key: PhotoFilter) => searched.filter((product) => inFilter(product, key)).length;

  const hrefFor = (key: PhotoFilter) => {
    const params = new URLSearchParams();
    if (key !== 'all') params.set('show', key);
    if (query) params.set('q', query);
    const text = params.toString();
    return text ? `/admin/photos?${text}` : '/admin/photos';
  };

  return (
    <div>
      <h1 className="type-display-sm">Photos</h1>
      <p className="mt-4 max-w-2xl type-body text-ink-soft">
        Every product&apos;s photos in one place. Open a product to add, replace, reorder, describe
        or delete its photos. That works the same before and after it is published.
      </p>

      <form action="/admin/photos" className="mt-6 flex max-w-xl gap-2">
        {filter !== 'all' && <input type="hidden" name="show" value={filter} />}
        <label htmlFor="photo-search" className="sr-only">
          Search products
        </label>
        <input
          id="photo-search"
          name="q"
          defaultValue={query}
          placeholder="Search by product name"
          className="min-w-0 flex-1 rounded-control border border-line px-3 py-2 type-body"
        />
        <button type="submit" className="rounded-control border border-line px-4 py-2 type-body hover:bg-sky">
          Search
        </button>
      </form>

      <nav aria-label="Filter products" className="mt-6 flex flex-wrap gap-2">
        {PHOTO_FILTERS.map(({ key, label }) => (
          <Link
            key={key}
            href={hrefFor(key)}
            aria-current={filter === key ? 'page' : undefined}
            className={`rounded-control border px-3 py-2 type-caption normal-case ${
              filter === key ? 'border-ink bg-ink text-paper' : 'border-line text-ink hover:bg-sky'
            } ${key === 'live-none' && countFor(key) > 0 && filter !== key ? 'text-warning' : ''}`}
          >
            {label} ({countFor(key)})
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="mt-8 type-body text-ink-soft">{emptyMessage(filter, query !== '')}</p>
      ) : (
        <ul className="mt-6 border-t border-line">
          {shown.map((product) => (
            <li key={product.id} className="flex flex-wrap items-center gap-4 border-b border-line py-3">
              <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control border border-line bg-paper">
                {product.cover ? (
                  <Image src={product.cover.url} alt={product.cover.alt} fill sizes="64px" className="object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center px-1 text-center type-caption normal-case text-warning">
                    No photo
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block type-body text-ink">{product.name}</span>
                <span className="mt-1 block type-caption normal-case text-ink-soft">
                  {product.brand} ·{' '}
                  <span className={product.isActive ? 'text-success' : ''}>
                    {product.isActive ? 'Published' : 'Draft'}
                  </span>{' '}
                  ·{' '}
                  <span className={product.pictures === 0 ? 'text-warning' : ''}>
                    {product.pictures === 0
                      ? 'no photos'
                      : product.pictures === 1
                        ? '1 photo'
                        : `${product.pictures} photos`}
                  </span>
                  {product.variants > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <span className={product.variantsWithPhoto < product.variants ? 'text-warning' : ''}>
                        {product.variantsWithPhoto} of {product.variants}{' '}
                        {product.variants === 1 ? 'variant has' : 'variants have'} their own photo
                      </span>
                    </>
                  )}
                </span>
              </span>
              <Link
                href={`/admin/products/${product.id}/images`}
                className="shrink-0 rounded-control bg-signal px-4 py-2 type-body text-white"
              >
                Manage photos
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
