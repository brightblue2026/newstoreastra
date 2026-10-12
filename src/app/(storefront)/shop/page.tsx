import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal, RevealItem } from '@/components/Reveal';
import ProductGrid, { EmptyListing } from '@/components/ProductGrid';
import FilterBar from '@/components/FilterBar';
import { buildHref, firstValue } from '@/lib/query';
import {
  getBrands,
  getTopCategories,
  isProductSort,
  listProducts,
  type ProductSort,
} from '@/lib/storefront';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Shop all',
  description:
    'Every Bright Blue product — dish, fabric, floor, car and personal care, tea, honey, spices and more, manufactured in Kerala.',
  alternates: { canonical: '/shop' },
};

/*
  The catalogue.

  Filters are read from the URL and applied in the database; the whole page is
  a server component. `searchParams` makes the route dynamic, so the 60s
  revalidate applies to the underlying data reads rather than a prerendered
  shell — which is what we want, since the filter space is unbounded.
*/

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const brandSlug = firstValue(params.brand);
  const categorySlug = firstValue(params.category);
  const sortParam = firstValue(params.sort);
  const sort: ProductSort = isProductSort(sortParam) ? sortParam : 'featured';

  const [brands, categories] = await Promise.all([getBrands(), getTopCategories()]);

  // An unknown slug in a hand-edited URL filters on nothing rather than 404-ing
  // — /shop always has something to show.
  const knownBrand = brands.some((b) => b.slug === brandSlug) ? brandSlug : undefined;
  const knownCategory = categories.some((c) => c.slug === categorySlug)
    ? categorySlug
    : undefined;

  const products = await listProducts({
    brandSlug: knownBrand,
    categorySlugs: knownCategory ? [knownCategory] : undefined,
    sort,
  });

  const current = {
    brand: knownBrand,
    category: knownCategory,
    sort: sort === 'featured' ? undefined : sort,
  };

  const filtered = knownBrand !== undefined || knownCategory !== undefined;

  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-24">
      <Reveal>
        <RevealItem>
          <p className="type-caption text-ink-soft">Catalogue</p>
        </RevealItem>
        <RevealItem>
          <h1 className="mt-6 type-display-sm">Shop all</h1>
        </RevealItem>
        <RevealItem>
          <p className="mt-6 max-w-2xl type-body-lg text-ink-soft">
            Everyday essentials from eight Bright Blue brands, made in Kerala.
          </p>
        </RevealItem>
      </Reveal>

      <div className="mt-16">
        <FilterBar
          pathname="/shop"
          current={current}
          sort={sort}
          groups={[
            {
              label: 'Brand',
              param: 'brand',
              options: brands.map((brand) => ({
                value: brand.slug,
                label: brand.name,
                count: brand.productCount,
              })),
            },
            {
              label: 'Category',
              param: 'category',
              options: categories.map((category) => ({
                value: category.slug,
                label: category.name,
                count: category.productCount,
              })),
            },
          ]}
        />
      </div>

      <div className="mt-16">
        {products.length > 0 ? (
          <>
            <p className="mb-8 type-caption text-ink-soft">
              <span className="tabular-nums">{products.length}</span>{' '}
              {products.length === 1 ? 'product' : 'products'}
            </p>
            <ProductGrid products={products} />
          </>
        ) : (
          <EmptyListing>
            {filtered ? (
              <>
                Nothing matches that combination.{' '}
                <Link href={buildHref('/shop', {})} className="underline">
                  Clear the filters
                </Link>{' '}
                to see the whole catalogue.
              </>
            ) : (
              <>The catalogue is being prepared. Please check back shortly.</>
            )}
          </EmptyListing>
        )}
      </div>
    </div>
  );
}
