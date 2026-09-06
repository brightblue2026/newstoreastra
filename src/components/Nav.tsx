'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from 'motion/react';
import { dur, ease } from '@/lib/motion';

export type NavBrand = {
  name: string;
  slug: string;
  accentHex: string;
  segmentLabel: string;
  productCount: number;
};

/** The primary destinations, shared by the desktop bar and the mobile panel. */
const PRIMARY_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/story', label: 'Our story' },
  { href: '/stockists', label: 'Stockists' },
  { href: '/search', label: 'Search' },
] as const;

/*
  Sticky header.

  Two independent state changes, both driven by scroll position:
    solid  — past 40px, the bar shrinks and gains a background + hairline
    hidden — scrolling down past 200px, it leaves; scrolling up, it returns

  Hide-on-scroll-down is worth the few lines. It gives the content the full
  viewport while reading and puts navigation back the instant it is wanted.

  Below `md` the link row is replaced by a disclosure panel. Until it existed,
  a phone could reach the logo and the cart and nothing else — Brands, Shop,
  Our story and Stockists were all inside a `hidden md:flex` row, leaving the
  footer as the only way to navigate the site on the device most customers use.
*/
export default function Nav({
  brands,
  cartCount = 0,
  onOpenCart,
}: {
  brands: NavBrand[];
  cartCount?: number;
  onOpenCart?: () => void;
}) {
  const { scrollY } = useScroll();
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const previous = scrollY.getPrevious() ?? 0;
    setSolid(y > 40);
    // Never hide the bar while either menu is open — on a phone that would take
    // the open panel off screen with it.
    setHidden(!menuOpen && !mobileOpen && y > previous && y > 200);
  });

  useEffect(() => {
    if (!menuOpen && !mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, mobileOpen]);

  // Stop the page behind from scrolling under the open panel, matching
  // `CartDrawer`. Restores whatever was there rather than clearing it, so two
  // overlays closing in either order cannot leave the page unscrollable.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  // Rotating a phone to landscape can cross the `md` breakpoint, which would
  // leave the panel open behind a desktop bar that no longer has a way to close it.
  useEffect(() => {
    if (!mobileOpen) return;
    const query = window.matchMedia('(min-width: 48rem)');
    const sync = () => {
      if (query.matches) setMobileOpen(false);
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [mobileOpen]);

  return (
    <motion.header
      animate={{
        y: hidden && !reduced ? '-100%' : 0,
        height: solid ? 64 : 88,
        backgroundColor: solid
          ? 'color-mix(in oklab, var(--color-paper) 92%, transparent)'
          : 'color-mix(in oklab, var(--color-paper) 0%, transparent)',
        boxShadow: solid ? '0 1px 3px rgb(11 31 58 / 0.08)' : '0 0 0 rgb(0 0 0 / 0)',
      }}
      transition={{ duration: dur.accent, ease }}
      // Sticky, not fixed: the bar sits in flow beneath the announcement ticker
      // and only pins once the ticker has scrolled away. Fixed would park it
      // on top of the ticker at rest.
      className="sticky top-0 z-50 backdrop-blur-md"
      onMouseLeave={() => setMenuOpen(false)}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-full max-w-(--container-page) items-center gap-4 px-6 sm:gap-8"
      >
        <Link href="/" className="type-heading" onClick={() => setMobileOpen(false)}>
          Bright Blue
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="brand-menu"
            onClick={() => setMenuOpen((v) => !v)}
            onMouseEnter={() => setMenuOpen(true)}
            className="type-body text-ink-soft hover:text-ink"
          >
            Brands
          </button>
          {PRIMARY_LINKS.filter((link) => link.href !== '/search').map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="type-body text-ink-soft hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-4">
          <button
            type="button"
            onClick={onOpenCart}
            className="rounded-control px-3 py-2 type-body text-ink-soft hover:text-ink"
          >
            Cart
            {cartCount > 0 && (
              <span className="ml-2 tabular-nums" aria-label={`${cartCount} items`}>
                ({cartCount})
              </span>
            )}
          </button>

          {/* A text label rather than a hamburger glyph: this site has no icon
              set, and CLAUDE.md rules out emoji. */}
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-control px-3 py-2 type-body text-ink-soft hover:text-ink md:hidden"
          >
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && brands.length > 0 && (
          <motion.div
            ref={menuRef}
            id="brand-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: dur.accent, ease }}
            className="absolute inset-x-0 top-full hidden border-t border-line bg-paper md:block"
          >
            {/* Four across, two rows, for the eight brands. */}
            <ul className="mx-auto grid max-w-(--container-page) gap-6 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
              {brands.map((brand) => (
                <li key={brand.slug}>
                  <Link
                    href={`/brands/${brand.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className="group block"
                  >
                    {/* The accent lives on this rule and nowhere else in the
                        menu — eight names in eight colours would be unreadable. */}
                    <span
                      aria-hidden="true"
                      className="block h-0.5 w-8 motion-accent group-hover:w-full"
                      style={{ backgroundColor: brand.accentHex }}
                    />
                    <span className="mt-3 block type-subhead">{brand.name}</span>
                    <span className="mt-1 block type-body text-ink-soft">
                      {brand.segmentLabel}
                    </span>
                    <span className="mt-1 block type-caption text-ink-soft">
                      {brand.productCount}{' '}
                      {brand.productCount === 1 ? 'product' : 'products'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduced ? 0 : dur.drawer, ease }}
            // Capped and scrollable: eight brands plus four links is taller than
            // a small phone in landscape.
            className="absolute inset-x-0 top-full max-h-[78dvh] overflow-y-auto border-t border-line bg-paper md:hidden"
          >
            <nav aria-label="Mobile" className="px-6 py-6">
              <ul className="flex flex-col">
                {PRIMARY_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      // Generous vertical padding: these are thumb targets, not
                      // pointer targets.
                      className="block border-b border-line py-4 type-subhead text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              {brands.length > 0 && (
                <>
                  <p className="mt-8 type-caption text-ink-soft">Brands</p>
                  <ul className="mt-2 flex flex-col">
                    {brands.map((brand) => (
                      <li key={brand.slug}>
                        <Link
                          href={`/brands/${brand.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-3 border-b border-line py-4"
                        >
                          <span
                            aria-hidden="true"
                            className="block h-0.5 w-6 shrink-0"
                            style={{ backgroundColor: brand.accentHex }}
                          />
                          <span className="type-body text-ink">{brand.name}</span>
                          <span className="ml-auto type-caption text-ink-soft">
                            {brand.segmentLabel}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
