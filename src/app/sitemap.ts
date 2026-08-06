import type { MetadataRoute } from 'next';
import { getSitemapData } from '@/lib/storefront';
import { absoluteUrl } from '@/lib/site';

// Rebuilt on the same 60s cadence as the pages it lists.
export const revalidate = 60;

/*
  The sitemap.

  Built from live rows, so an unpublished product leaves the sitemap the moment
  it is deactivated — every query behind `getSitemapData` filters on
  `isActive`. `/search` is absent on purpose: it is `robots: noindex`, and a
  sitemap that lists a page telling crawlers to go away wastes crawl budget.

  If the database is unreachable, `getSitemapData` returns empty lists and this
  degrades to the static routes rather than throwing — an empty sitemap is
  recoverable, a 500 on /sitemap.xml is a crawl error.
*/
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, brands, categories, combos } = await getSitemapData();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/shop'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/story'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/stockists'), changeFrequency: 'weekly', priority: 0.5 },
  ];

  return [
    ...staticRoutes,
    ...brands.map((brand) => ({
      url: absoluteUrl(`/brands/${brand.slug}`),
      lastModified: brand.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...categories.map((category) => ({
      url: absoluteUrl(`/categories/${category.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: absoluteUrl(`/products/${product.slug}`),
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...combos.map((combo) => ({
      url: absoluteUrl(`/combos/${combo.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
