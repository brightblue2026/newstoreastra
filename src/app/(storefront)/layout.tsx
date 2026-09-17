import Link from 'next/link';
import Ticker from '@/components/Ticker';
import StorefrontChrome from '@/components/StorefrontChrome';
import { getContent, getPublishedPolicies } from '@/lib/content';
import { getBrands, getSellerEntity } from '@/lib/storefront';

/*
  Storefront shell.

  The announcement ticker, the header + cart drawer, and the footer are the same
  on every browse page, so they live here rather than in each page. Two
  consequences worth naming:

    - the brand list is fetched once per layout render, not once per page, and
      the mega-menu is populated everywhere rather than only on the homepage;
    - every page below stays a server component. The only client boundary is
      `StorefrontChrome`, which owns the single piece of shared state (whether
      the cart is open).

  Both reads degrade to empty rather than throwing — a database hiccup should
  cost the menu and the GSTIN line, not every page on the site.
*/

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [announcement, brands, seller, policies] = await Promise.all([
    getContent('announcement_bar'),
    getBrands(),
    getSellerEntity(),
    getPublishedPolicies(),
  ]);

  return (
    <>
      <Ticker items={announcement.items} />

      <StorefrontChrome brands={brands} />

      <main>{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-(--container-page) px-6 py-16">
          {brands.length > 0 && (
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {brands.map((brand) => (
                <li key={brand.slug}>
                  <Link
                    href={`/brands/${brand.slug}`}
                    className="type-body text-ink-soft hover:text-ink"
                  >
                    {brand.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            <li>
              <Link href="/shop" className="type-body text-ink-soft hover:text-ink">
                Shop all
              </Link>
            </li>
            <li>
              <Link href="/search" className="type-body text-ink-soft hover:text-ink">
                Search
              </Link>
            </li>
            <li>
              <Link href="/story" className="type-body text-ink-soft hover:text-ink">
                Our story
              </Link>
            </li>
            <li>
              <Link href="/stockists" className="type-body text-ink-soft hover:text-ink">
                Stockists
              </Link>
            </li>
          </ul>

          {/* Only policies BBTC has published — an unwritten one has no page. */}
          {policies.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
              {policies.map((policy) => (
                <li key={policy.slug}>
                  <Link
                    href={`/policies/${policy.slug}`}
                    className="type-body text-ink-soft hover:text-ink"
                  >
                    {policy.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-12 type-body text-ink-soft">
            {/* GSTIN prints only when exactly one seller entity is active —
                brief §14 Q6 is still open. */}
            <p>{seller?.legalName ?? 'Bright Blue Trading Corporation'}</p>
            {seller?.gstin && <p className="mt-1 type-mono">GSTIN {seller.gstin}</p>}
            <p className="mt-1">Ernakulam, Kerala</p>
          </div>
        </div>
      </footer>
    </>
  );
}
