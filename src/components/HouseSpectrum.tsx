'use client';

import { useState } from 'react';
import Link from 'next/link';

export type SpectrumBrand = {
  name: string;
  slug: string;
  accentHex: string;
  segmentLabel: string;
  tagline: string | null;
  productCount: number;
};

/*
  Eight houses, one spectrum band.

  A grid of panels, two across on a tablet and four on a desktop. It used to
  be one flex row of eight, but the page container tops out at 1280px, which
  leaves each panel ~106px of text width: less than "Kenzaniya" at heading
  size, so the row pushed the page 22px wider than the viewport. Hovering or
  focusing a panel reveals its tagline and product count. Panels within two positions of
  the active one borrow a sliver of its accent as a background tint — a
  literal rendering of the section's claim: eight houses, one family of
  colour, one factory.

  Every panel is a real `<Link>`. Hover and focus drive the same state, so
  the reveal reads identically for a mouse and a keyboard, and the
  revealed detail is always present in the DOM for assistive tech — only its
  opacity changes, never its presence.
*/
export default function HouseSpectrum({ brands }: { brands: SpectrumBrand[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (brands.length === 0) return null;

  return (
    <div
      className="grid grid-cols-1 overflow-hidden rounded-card border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4"
      onMouseLeave={() => setActiveIndex(null)}
    >
      {brands.map((brand, index) => {
        const isActive = activeIndex === index;
        const distance = activeIndex === null ? Infinity : Math.abs(index - activeIndex);
        // Immediate neighbours borrow more of the active accent than
        // second-order ones; anything further stays neutral paper.
        const bleedPct = distance === 1 ? 8 : distance === 2 ? 4 : 0;
        const tintPct = isActive ? 16 : bleedPct;

        return (
          <div
            key={brand.slug}
            // Each panel draws its own right and bottom hairline, so a short
            // last row ends in a clean step instead of an empty grey cell.
            className="min-w-0 shadow-[inset_-1px_-1px_0_var(--color-line)]"
            style={{
              backgroundColor:
                tintPct > 0
                  ? `color-mix(in oklab, ${brand.accentHex} ${tintPct}%, var(--color-paper))`
                  : 'var(--color-paper)',
              // Plain CSS transition — the global reduced-motion media query
              // in globals.css already collapses this to ~0 automatically.
              transition: 'background-color var(--bb-duration-accent) var(--bb-ease-out)',
            }}
          >
            <Link
              href={`/brands/${brand.slug}`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              className="flex h-full min-h-24 flex-col gap-6 p-6"
            >
              {/* Accent reaches this rule, the tint above, and nowhere else —
                  the name and copy stay ink, per the one-accent-at-a-time rule. */}
              <span
                aria-hidden="true"
                className="block h-1 rounded-full"
                style={{
                  backgroundColor: brand.accentHex,
                  width: isActive ? '5rem' : '2.5rem',
                  transition: 'width var(--bb-duration-accent) var(--bb-ease-out)',
                }}
              />
              <span className="flex flex-col gap-2">
                <span className="block type-heading">{brand.name}</span>
                <span className="block type-caption text-ink-soft">{brand.segmentLabel}</span>
                {/* Reserved space, not conditionally rendered — a keyboard or
                    screen-reader user gets this content regardless of the
                    fade, and the panel never jumps in height to show it. */}
                <span
                  className="flex flex-col gap-2"
                  style={{
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? 'translateY(0)' : 'translateY(4px)',
                    transition:
                      'opacity var(--bb-duration-accent) var(--bb-ease-out), transform var(--bb-duration-accent) var(--bb-ease-out)',
                  }}
                >
                  {brand.tagline && (
                    <span className="block type-body text-ink-soft">{brand.tagline}</span>
                  )}
                  <span className="block type-caption text-ink-soft">
                    {brand.productCount} {brand.productCount === 1 ? 'product' : 'products'}
                  </span>
                </span>
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
