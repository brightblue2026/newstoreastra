import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from '@/components/Link';
import ProductDetail from '@/components/ProductDetail';
import { Reveal, RevealItem } from '@/components/Reveal';
import ProductGrid from '@/components/ProductGrid';
import { getApprovedReviews, getProductBySlug, listProducts, type ProductPage } from '@/lib/storefront';
import { isPurchasable } from '@/lib/money';
import { absoluteUrl } from '@/lib/site';
import { BUSINESS } from '@/lib/business';
import { CONTACT } from '@/lib/contact';
import { jsonLdString } from '@/lib/json-ld';
import { Reviews } from '@/components/Reviews';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) return { title: 'Product not found', robots: { index: false, follow: true } };

  return {
    title: product.metaTitle ?? product.name,
    description: product.metaDesc ?? product.shortDesc,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.metaTitle ?? product.name,
      description: product.metaDesc ?? product.shortDesc,
      images: product.images[0] ? [product.images[0].url] : undefined,
      type: 'website',
      url: absoluteUrl(`/products/${product.slug}`),
    },
  };
}

/**
 * `Product` + `Offer` JSON-LD.
 *
 * The offers array is built only from variants that carry a real price. A
 * product where everything is "Price on request" gets a `Product` node with no
 * `offers` key at all — emitting `price: 0` would be the structured-data
 * equivalent of the ₹0.00 bug this build exists to fix, and would put a free
 * price in search results.
 */
function productJsonLd(product: ProductPage) {
  const priced = product.variants.filter((variant) => isPurchasable(variant.pricePaise));

  const offers = priced.map((variant) => ({
    '@type': 'Offer',
    url: absoluteUrl(`/products/${product.slug}`),
    priceCurrency: 'INR',
    // Schema.org wants a decimal string, not paise.
    price: ((variant.pricePaise as number) / 100).toFixed(2),
    sku: variant.sku,
    availability: variant.availableStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDesc,
    url: absoluteUrl(`/products/${product.slug}`),
    productID: product.id,
    brand: { '@type': 'Brand', name: product.brand.name },
    category: product.category.name,
    ...(product.images.length > 0 ? { image: product.images.map((i) => i.url) } : {}),
    ...(offers.length > 0 ? { offers } : {}),
  };
}

/** A disclosure that works before JavaScript arrives. */
function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-line py-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between type-subhead">
        {title}
        <span
          aria-hidden="true"
          className="ml-4 text-ink-soft transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-6 max-w-2xl">{children}</div>
    </details>
  );
}

/** Segments sold as chemical preparations, which carry a caution by default. */
const CHEMICAL_SEGMENTS = ['HOME_CARE', 'DISH_CARE', 'FABRIC_CARE', 'CAR_CARE'];
const STANDARD_CAUTION = 'Keep out of reach of children. Avoid contact with eyes.';

/**
 * The label declarations that are not already shown elsewhere on the page.
 * A product's own value wins; otherwise the seller's standing detail from
 * `business.ts`; and a row with neither is left out rather than shown blank.
 */
function labelDetailRows(product: ProductPage): { name: string; value: string; mono?: boolean }[] {
  const sizes = [...new Set(product.variants.map((variant) => variant.size))];
  const edible =
    product.isFoodProduct || product.brand.segment === 'FOOD' || product.brand.segment === 'BEVERAGE';
  const fssai = edible ? (product.brand.fssaiLicence ?? BUSINESS.fssaiLicense) : null;

  const rows: { name: string; value: string; mono?: boolean }[] = [];
  if (sizes.length > 0) rows.push({ name: 'Net quantity', value: sizes.join(', ') });
  rows.push({ name: 'Country of origin', value: product.countryOfOrigin ?? 'India' });
  rows.push(
    product.manufacturerName
      ? {
          name: 'Manufactured and marketed by',
          value: [product.manufacturerName, product.manufacturerAddress].filter(Boolean).join(', '),
        }
      : { name: 'Marketed by', value: `${BUSINESS.legalName}, ${BUSINESS.registeredAddress}` },
  );
  if (product.shelfLife) rows.push({ name: 'Best before', value: product.shelfLife });
  if (fssai) rows.push({ name: 'FSSAI Lic. No.', value: fssai, mono: true });
  rows.push({ name: 'Customer care', value: `${CONTACT.tollFreeDisplay} · ${CONTACT.email}` });
  return rows;
}

const FOOD_LABEL_FIELDS: { key: string; label: string }[] = [
  { key: 'netQty', label: 'Net quantity' },
  { key: 'batch', label: 'Batch number' },
  { key: 'mfgDate', label: 'Manufactured' },
  { key: 'bestBefore', label: 'Best before' },
  { key: 'allergens', label: 'Allergens' },
  { key: 'nutrition', label: 'Nutrition' },
];

function foodLabelRows(label: Record<string, unknown>) {
  return FOOD_LABEL_FIELDS.flatMap(({ key, label: name }) => {
    const value = label[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return [{ name, value }];
    }
    if (typeof value === 'number') return [{ name, value: String(value) }];
    return [];
  });
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const product = await getProductBySlug(slug);
  // The body lives in `not-found.tsx` beside this file, so the response
  // carries a real 404 rather than a 200 with 404-shaped content on it.
  if (!product) notFound();

  // Approved reviews only — `getApprovedReviews` filters, not the caller.
  const reviews = await getApprovedReviews(product.id);

  // Same brand, minus this product. A related rail is worth having only when
  // there is something to put in it.
  const related = (
    await listProducts({ brandSlug: product.brand.slug, sort: 'featured', take: 5 })
  )
    .filter((candidate) => candidate.slug !== product.slug)
    .slice(0, 4);

  const isVeg =
    product.isFoodProduct &&
    product.foodLabel !== null &&
    product.foodLabel.vegMark === true;

  const labelRows = product.foodLabel ? foodLabelRows(product.foodLabel) : [];
  const caution =
    product.safetyWarnings ??
    (CHEMICAL_SEGMENTS.includes(product.brand.segment) ? STANDARD_CAUTION : null);

  return (
    <>
      {/*
        JSON-LD is emitted from the server component, so it is in the HTML for
        a crawler that never runs JavaScript.
      */}
      <script
        type="application/ld+json"
        // Escaped via jsonLdString: product name/description are admin-entered
        // text, and a stray "</script>" in either would otherwise break out of
        // this tag into live HTML.
        dangerouslySetInnerHTML={{ __html: jsonLdString(productJsonLd(product)) }}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Shop', item: absoluteUrl('/shop') },
          { '@type': 'ListItem', position: 2, name: product.brand.name, item: absoluteUrl(`/brands/${product.brand.slug}`) },
          { '@type': 'ListItem', position: 3, name: product.name, item: absoluteUrl(`/products/${product.slug}`) },
        ],
      }) }} />
      <div className="mx-auto max-w-(--container-page) px-6 py-16">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 type-caption text-ink-soft">
            <li className="flex items-center gap-2">
              <Link href="/shop" className="inline-flex min-h-11 items-center hover:text-ink">
                Shop
              </Link>
              <span aria-hidden="true">/</span>
            </li>
            <li className="flex items-center gap-2">
              <Link href={`/brands/${product.brand.slug}`} className="inline-flex min-h-11 items-center hover:text-ink">
                {product.brand.name}
              </Link>
              <span aria-hidden="true">/</span>
            </li>
            <li aria-current="page">{product.name}</li>
          </ol>
        </nav>

        <div className="mt-12">
          <ProductDetail product={product} />
        </div>

        {/* ------------------------------------------------------ the detail */}
        <div className="mt-24 max-w-3xl">
          <Accordion title="Description">
            <div className="space-y-4">
              {product.description
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter((paragraph) => paragraph.length > 0)
                .map((paragraph) => (
                  <p key={paragraph.slice(0, 40)} className="type-body text-ink-soft">
                    {paragraph}
                  </p>
                ))}
            </div>
          </Accordion>

          {product.usageSteps.length > 0 && (
            <Accordion title="How to use">
              <ol className="space-y-4">
                {product.usageSteps.map((step, index) => (
                  <li key={step} className="flex gap-4 type-body text-ink-soft">
                    <span className="tabular-nums text-ink">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </Accordion>
          )}

          {product.ingredients && (
            <Accordion title="Ingredients">
              <p className="type-body text-ink-soft">{product.ingredients}</p>
            </Accordion>
          )}

          <Accordion title="Product details">
            <dl className="space-y-3">
              {labelDetailRows(product).map((row) => (
                <div key={row.name} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                  <dt className="shrink-0 type-caption text-ink-soft sm:w-40">{row.name}</dt>
                  <dd className={`min-w-0 break-words ${row.mono ? 'type-mono' : 'type-body'}`}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 type-caption normal-case text-ink-soft">
              MRP is shown with the price for the size you select, inclusive of all taxes.
            </p>
          </Accordion>

          {caution && (
            <Accordion title="Caution">
              <p className="whitespace-pre-line type-body text-ink-soft">{caution}</p>
            </Accordion>
          )}

          {/*
            The FSSAI panel. Rendered from whatever the food label actually
            holds — a missing field is omitted, never printed as "—" or filled
            with a plausible-looking default. The publish guard is what
            guarantees a live food product has these; this is the display of
            them, not a second enforcement point.
          */}
          {product.isFoodProduct && (labelRows.length > 0 || product.brand.fssaiLicence) && (
            <Accordion title="Food label">
              {isVeg && (
                <p className="mb-4 type-caption text-success">Vegetarian</p>
              )}
              <dl className="space-y-3">
                {labelRows.map((row) => (
                  <div key={row.name} className="flex gap-4">
                    <dt className="w-40 shrink-0 type-caption text-ink-soft">{row.name}</dt>
                    <dd className="type-body">{row.value}</dd>
                  </div>
                ))}
                {product.brand.fssaiLicence && (
                  <div className="flex gap-4">
                    <dt className="w-40 shrink-0 type-caption text-ink-soft">FSSAI licence</dt>
                    <dd className="type-mono">{product.brand.fssaiLicence}</dd>
                  </div>
                )}
              </dl>
            </Accordion>
          )}

          {product.isCosmetic && product.brand.cosmeticLicence && (
            <Accordion title="Cosmetics licence">
              <p className="type-mono">{product.brand.cosmeticLicence}</p>
            </Accordion>
          )}

          <Accordion title="Questions about this product">
            <p className="type-body text-ink-soft">
              Call{' '}
              <a href={CONTACT.tollFreeHref} className="underline">
                {CONTACT.tollFree}
              </a>{' '}
              toll free, or email{' '}
              <a href={`mailto:${CONTACT.email}`} className="underline">
                {CONTACT.email}
              </a>
              .
            </p>
          </Accordion>
        </div>

        <Reviews productId={product.id} reviews={reviews} />

        {related.length > 0 && (
          <section className="mt-24 border-t border-line pt-24">
            <Reveal>
              <RevealItem>
                <h2 className="type-display-sm">More from {product.brand.name}</h2>
              </RevealItem>
            </Reveal>
            <div className="mt-16">
              <ProductGrid products={related} />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
