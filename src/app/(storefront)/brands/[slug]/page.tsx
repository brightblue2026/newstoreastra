import type { Metadata } from 'next';
import NotFoundView from '@/components/NotFoundView';
import { Reveal, RevealItem } from '@/components/Reveal';
import ProductGrid, { EmptyListing } from '@/components/ProductGrid';
import FilterBar from '@/components/FilterBar';
import { firstValue } from '@/lib/query';
import {
  getBrandBySlug,
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
  const brand = await getBrandBySlug(slug);

  if (!brand) return { title: 'Brand not found', robots: { index: false, follow: true } };

  return {
    title: brand.name,
    description: brand.tagline ?? `${brand.name} from Bright Blue — ${brand.segmentLabel}.`,
    alternates: { canonical: `/brands/${brand.slug}` },
  };
}

/*
  A brand page.

  This is the one place the brand accent is fully spent: the rule under the
  name, and the section wash. The filter chips, the body copy and every CTA
  stay ink and signal — eight houses each repainting the whole interface is
  exactly what the one-accent rule exists to prevent.

  `--bb-accent` is set on the wrapper rather than passed down as a prop, so any
  descendant that wants the live accent reads one variable.
*/

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const brand = await getBrandBySlug(slug);
  if (!brand) return (
      <NotFoundView
        heading="We couldn't find that brand"
        body="Bright Blue makes eight brands across cleaning, personal care, food and fragrance. The link may be out of date — every one of them is listed below."
      />
    );

  const sortParam = firstValue(query.sort);
  const sort: ProductSort = isProductSort(sortParam) ? sortParam : 'featured';

  const products = await listProducts({ brandSlug: brand.slug, sort });

  const pathname = `/brands/${brand.slug}`;
  const current = { sort: sort === 'featured' ? undefined : sort };

  return (
    <div style={{ ['--bb-accent' as string]: brand.accentHex }}>
      <section
        className="border-b border-line"
        style={{
          backgroundColor: `color-mix(in oklab, ${brand.accentHex} 8%, var(--color-paper))`,
        }}
      >
        <Reveal className="mx-auto max-w-(--container-page) px-6 py-24">
          <RevealItem>
            <p className="type-caption text-ink-soft">{brand.segmentLabel}</p>
          </RevealItem>
          <RevealItem>
            {/* The accent, on a rule. Not on the name. */}
            <span
              aria-hidden="true"
              className="mt-6 block h-1 w-16 rounded-full"
              style={{ backgroundColor: brand.accentHex }}
            />
          </RevealItem>
          <RevealItem>
            <h1 className="mt-6 type-display-lg">{brand.name}</h1>
          </RevealItem>
          {brand.tagline && (
            <RevealItem>
              <p className="mt-6 max-w-2xl type-body-lg text-ink-soft">{brand.tagline}</p>
            </RevealItem>
          )}
          <RevealItem>
            <p className="mt-8 type-caption text-ink-soft">
              <span className="tabular-nums">{brand.productCount}</span>{' '}
              {brand.productCount === 1 ? 'product' : 'products'}
            </p>
          </RevealItem>
        </Reveal>
      </section>

      {brand.story && (
        <section className="border-b border-line">
          <Reveal className="mx-auto max-w-(--container-page) px-6 py-24">
            <RevealItem>
              <h2 className="type-display-sm">The house</h2>
            </RevealItem>
            <div className="mt-12 max-w-2xl space-y-6">
              {brand.story
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter((paragraph) => paragraph.length > 0)
                .map((paragraph) => (
                  <RevealItem key={paragraph.slice(0, 40)}>
                    <p className="type-body-lg text-ink-soft">{paragraph}</p>
                  </RevealItem>
                ))}
            </div>
          </Reveal>
        </section>
      )}

      <div className="mx-auto max-w-(--container-page) px-6 py-24">
        <FilterBar pathname={pathname} current={current} sort={sort} groups={[]} />

        <div className="mt-16">
          {products.length > 0 ? (
            <ProductGrid products={products} />
          ) : (
            <EmptyListing>
              {brand.name} products are being prepared. Please check back shortly.
            </EmptyListing>
          )}
        </div>

        {/*
          Licence numbers are printed where the law expects them to be findable.
          Both are open questions in the brief (§14 Q4 and Q5), so each prints
          only when the field is actually populated — never a placeholder.
        */}
        {(brand.fssaiLicence ?? brand.cosmeticLicence) && (
          <div className="mt-24 border-t border-line pt-8 type-caption text-ink-soft">
            {brand.fssaiLicence && (
              <p>
                FSSAI licence <span className="type-mono">{brand.fssaiLicence}</span>
              </p>
            )}
            {brand.cosmeticLicence && (
              <p className="mt-1">
                Cosmetics manufacturing licence{' '}
                <span className="type-mono">{brand.cosmeticLicence}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
