import Link from '@/components/Link';
import MotionProvider from '@/components/MotionProvider';
import Ticker from '@/components/Ticker';
import StorefrontChrome from '@/components/StorefrontChrome';
import { BUSINESS } from '@/lib/business';
import { getContent } from '@/lib/content';
import { POLICY_ROUTES } from '@/lib/policy-defaults';
import { getBrands } from '@/lib/storefront';

/** Help and policy pages, linked from every page — a payment gateway and the law both look for them here. */
const HELP_LINKS = [
  { href: '/contact', label: 'Contact us' },
  { href: POLICY_ROUTES.shipping.path, label: 'Shipping policy' },
  { href: POLICY_ROUTES.returns.path, label: 'Refund and cancellation' },
  { href: POLICY_ROUTES.privacy.path, label: 'Privacy policy' },
  { href: POLICY_ROUTES.terms.path, label: 'Terms and conditions' },
];

/*
  Storefront shell.

  The announcement ticker, the header + cart drawer, and the footer are the same
  on every browse page, so they live here rather than in each page. Two
  consequences worth naming:

    - the brand list is fetched once per layout render, not once per page, and
      the mega-menu is populated everywhere rather than only on the homepage;
    - every page below stays a server component. The only client boundary is
      `StorefrontChrome`, which owns the single piece of shared state (whether
      the cart is open). `MotionProvider` wraps it all only to hand the
      animation engine down, loaded after first paint; it renders no markup.

  Both reads degrade to empty rather than throwing — a database hiccup should
  cost the menu, not every page on the site. The seller's name, GSTIN and
  address in the footer come from `business.ts`, not the database.
*/

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [announcement, brands] = await Promise.all([getContent('announcement_bar'), getBrands()]);
  const officer = BUSINESS.grievanceOfficer;

  return (
    <MotionProvider>
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
                    className="link-underline type-body text-ink-soft motion-accent hover:text-ink"
                  >
                    {brand.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            <li>
              <Link href="/shop" className="link-underline type-body text-ink-soft motion-accent hover:text-ink">
                Shop all
              </Link>
            </li>
            <li>
              <Link href="/search" className="link-underline type-body text-ink-soft motion-accent hover:text-ink">
                Search
              </Link>
            </li>
            <li>
              <Link href="/story" className="link-underline type-body text-ink-soft motion-accent hover:text-ink">
                Our story
              </Link>
            </li>
            <li>
              <Link href="/stockists" className="link-underline type-body text-ink-soft motion-accent hover:text-ink">
                Stockists
              </Link>
            </li>
          </ul>

          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            {HELP_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="link-underline type-body text-ink-soft motion-accent hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-12 type-body text-ink-soft">
            <p>
              {BUSINESS.legalName}
              {BUSINESS.gstin && (
                <>
                  {' · '}
                  <span className="type-mono">GSTIN {BUSINESS.gstin}</span>
                </>
              )}
            </p>
            <p className="mt-1">{BUSINESS.registeredAddress}</p>
            {BUSINESS.fssaiLicense && (
              <p className="mt-1 type-mono">FSSAI Lic. No. {BUSINESS.fssaiLicense}</p>
            )}
            {officer.name && officer.email && (
              <p className="mt-1">
                Grievance Officer: {officer.name} · {officer.email}
              </p>
            )}
            <p className="mt-1">
              © {new Date().getFullYear()} {BUSINESS.legalName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </MotionProvider>
  );
}
