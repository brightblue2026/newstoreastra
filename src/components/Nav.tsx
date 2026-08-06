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

/*
  Sticky header.

  Two independent state changes, both driven by scroll position:
    solid  — past 40px, the bar shrinks and gains a background + hairline
    hidden — scrolling down past 200px, it leaves; scrolling up, it returns

  Hide-on-scroll-down is worth the few lines. It gives the content the full
  viewport while reading and puts navigation back the instant it is wanted.
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
  const menuRef = useRef<HTMLDivElement>(null);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const previous = scrollY.getPrevious() ?? 0;
    setSolid(y > 40);
    // Never hide the bar while the mega-menu is open under the user's cursor.
    setHidden(!menuOpen && y > previous && y > 200);
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

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
        className="mx-auto flex h-full max-w-(--container-page) items-center gap-8 px-6"
      >
        <Link href="/" className="type-heading">
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
          <Link href="/shop" className="type-body text-ink-soft hover:text-ink">
            Shop
          </Link>
          <Link href="/story" className="type-body text-ink-soft hover:text-ink">
            Our story
          </Link>
          <Link href="/stockists" className="type-body text-ink-soft hover:text-ink">
            Stockists
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-4">
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
            className="absolute inset-x-0 top-full border-t border-line bg-paper"
          >
            <ul className="mx-auto grid max-w-(--container-page) gap-6 px-6 py-8 sm:grid-cols-3 lg:grid-cols-7">
              {brands.map((brand) => (
                <li key={brand.slug}>
                  <Link
                    href={`/brands/${brand.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className="group block"
                  >
                    {/* The accent lives on this rule and nowhere else in the
                        menu — seven names in seven colours would be unreadable. */}
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
    </motion.header>
  );
}
