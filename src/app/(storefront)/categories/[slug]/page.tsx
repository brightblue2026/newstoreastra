import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Reveal, RevealItem } from '@/components/Reveal';
import ProductGrid, { EmptyListing } from '@/components/ProductGrid';
import FilterBar from '@/components/FilterBar';
import { firstValue } from '@/lib/query';
import {
  getBrands,
  getCategoryBySlug,
  isProductSort,
  listProducts,
  type ProductSort,
} from '@/lib/storefront';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) return { title: 'Category not found' };

  return {
    title: category.name,
    description: category.description ?? `${category.name} from Bright Blue.`,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

/*
  A category page.

  Listing covers the whole subtree — see `getCategoryBySlug`. A parent range
  showing nothing because its products all hang off children would read as an
  empty shop rather than as a structure choice.
*/

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const brandSlug = firstValue(query.brand);
  const sortParam = firstValue(query.sort);
  const sort: ProductSort = isProductSort(sortParam) ? sortParam : 'featured';

  const brands = await getBrands();
  const knownBrand = brands.some((b) => b.slug === brandSlug) ? brandSlug : undefined;

  const products = await listProducts({
    categorySlugs: category.slugs,
    brandSlug: knownBrand,
    sort,
  });

  const pathname = `/categories/${category.slug}`;
  const current = {
    brand: knownBrand,
    sort: sort === 'featured' ? undefined : sort,
  };

  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-24">
      <Reveal>
        {category.ancestors.length > 0 && (
          <RevealItem>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-2 type-caption text-ink-soft">
                {category.ancestors.map((ancestor) => (
                  <li key={ancestor.slug} className="flex items-center gap-2">
                    <Link href={`/categories/${ancestor.slug}`} className="hover:text-ink">
                      {ancestor.name}
                    </Link>
                    <span aria-hidden="true">/</span>
                  </li>
                ))}
                <li aria-current="page">{category.name}</li>
              </ol>
            </nav>
          </RevealItem>
        )}

        <RevealItem>
          <h1 className="mt-6 type-display-sm">{category.name}</h1>
        </RevealItem>

        {category.description && (
          <RevealItem>
            <p className="mt-6 max-w-2xl type-body-lg text-ink-soft">
              {category.description}
            </p>
          </RevealItem>
        )}
      </Reveal>

      {category.children.length > 0 && (
        <Reveal className="mt-12 flex flex-wrap gap-3" gap={0.04}>
          {category.children.map((child) => (
            <RevealItem key={child.slug}>
              <Link
                href={`/categories/${child.slug}`}
                className="flex items-center gap-2 rounded-full border border-line px-4 py-2 type-caption motion-accent hover:border-ink"
              >
                {child.name}
                <span className="tabular-nums text-ink-soft">{child.productCount}</span>
              </Link>
            </RevealItem>
          ))}
        </Reveal>
      )}

      <div className="mt-16">
        <FilterBar
          pathname={pathname}
          current={current}
          sort={sort}
          groups={[
            {
              label: 'Brand',
              param: 'brand',
              options: brands.map((brand) => ({ value: brand.slug, label: brand.name })),
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
            {knownBrand
              ? 'No products from that brand in this category yet.'
              : 'This range is being prepared. Please check back shortly.'}
          </EmptyListing>
        )}
      </div>
    </div>
  );
}
