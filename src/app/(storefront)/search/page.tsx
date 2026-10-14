import type { Metadata } from 'next';
import Link from '@/components/Link';
import { Reveal, RevealItem } from '@/components/Reveal';
import ProductGrid, { EmptyListing } from '@/components/ProductGrid';
import { firstValue } from '@/lib/query';
import { getBrands, isProductSort, listProducts, type ProductSort } from '@/lib/storefront';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search the Bright Blue catalogue.',
  alternates: { canonical: '/search' },
  // A query-string result page is not something to index; the catalogue is
  // reachable through /shop, the brands and the categories.
  robots: { index: false, follow: true },
};

/*
  Search.

  A plain GET form. No debounce, no fetch-as-you-type, no client state: the
  query lives in the URL, the result is shareable, and it works with
  JavaScript still on the wire. `listProducts` matches name, short description,
  description, brand name and fragrance name — searching "lemon" should find
  the MX-3 fragrance, not just products with "lemon" in the title.
*/

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = firstValue(params.q)?.trim() ?? '';
  const sortParam = firstValue(params.sort);
  const sort: ProductSort = isProductSort(sortParam) ? sortParam : 'featured';

  // A single character matches most of the catalogue and reads as a bug.
  const query = raw.length >= 2 ? raw : '';

  const [products, brands] = await Promise.all([
    query ? listProducts({ search: query, sort }) : Promise.resolve([]),
    getBrands(),
  ]);

  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-24">
      <Reveal>
        <RevealItem>
          <h1 className="type-display-sm">Search</h1>
        </RevealItem>

        <RevealItem>
          <form action="/search" method="get" role="search" className="mt-12 max-w-xl">
            <label htmlFor="q" className="type-caption text-ink-soft">
              What are you looking for?
            </label>
            <div className="mt-3 flex gap-3">
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={raw}
                autoComplete="off"
                placeholder="Dish wash, cardamom, floor cleaner…"
                className="min-w-0 flex-1 rounded-control border border-line bg-paper px-4 py-3 type-body"
              />
              <button
                type="submit"
                className="btn btn-primary"
              >
                Search
              </button>
            </div>
          </form>
        </RevealItem>
      </Reveal>

      <div className="mt-16">
        {raw.length === 0 ? (
          brands.length > 0 && (
            <div>
              <h2 className="type-caption text-ink-soft">Or browse a house</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {brands.map((brand) => (
                  <Link
                    key={brand.slug}
                    href={`/brands/${brand.slug}`}
                    className="flex items-center gap-2 rounded-full border border-line px-4 py-2 type-caption motion-accent hover:border-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: brand.accentHex }}
                    />
                    {brand.name}
                  </Link>
                ))}
              </div>
            </div>
          )
        ) : query.length === 0 ? (
          <EmptyListing>Please enter at least two characters.</EmptyListing>
        ) : products.length > 0 ? (
          <>
            <p className="mb-8 type-caption text-ink-soft">
              <span className="tabular-nums">{products.length}</span>{' '}
              {products.length === 1 ? 'result' : 'results'} for &ldquo;{query}&rdquo;
            </p>
            <ProductGrid products={products} />
          </>
        ) : (
          <EmptyListing>
            Nothing matched &ldquo;{query}&rdquo;.{' '}
            <Link href="/shop" className="underline">
              Browse the whole catalogue
            </Link>
            .
          </EmptyListing>
        )}
      </div>
    </div>
  );
}
