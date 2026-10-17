'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from '@/components/Link';
import { m, useReducedMotion } from 'motion/react';
import { dur, ease } from '@/lib/motion';
import { formatPrice, isPurchasable } from '@/lib/money';

/*
  The catalogue card.

  On the accent: it reaches the hairline border and the image field wash, and
  stops there. The brand label is ink and the CTA is `--bb-signal`, on every
  card, in every brand. A CTA that changes colour per brand stops reading as
  "the button" and starts reading as decoration — and the one-accent rule exists
  so a grid of eight houses doesn't turn into a paint chart.
*/

export type ProductCardData = {
  slug: string;
  name: string;
  brandName: string;
  /** `Brand.accentHex` — the live accent for this card. */
  accentHex: string;
  size?: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  /** Second photo, revealed on hover. Optional — most SKUs have one shot. */
  hoverImageUrl?: string | null;
  /** Paise, or null for "Price on request". Never zero as a stand-in. */
  pricePaise: number | null;
  mrpPaise: number | null;
};

export default function ProductCard({
  product,
  onQuickAdd,
}: {
  product: ProductCardData;
  onQuickAdd?: (slug: string) => void;
}) {
  const [pointerHover, setHover] = useState(false);
  // Keyboard focus anywhere inside the card counts as hover, so tabbing
  // through a grid shows the same lift, border and zoom a pointer does.
  const [focused, setFocused] = useState(false);
  const hover = pointerHover || focused;
  const reduced = useReducedMotion();

  const {
    slug,
    name,
    brandName,
    accentHex,
    size,
    imageUrl,
    imageAlt,
    hoverImageUrl,
    pricePaise,
    mrpPaise,
  } = product;

  const purchasable = isPurchasable(pricePaise);
  const showMrp =
    purchasable && mrpPaise !== null && mrpPaise > (pricePaise as number);

  // A 12% wash rather than the raw hex: the accent belongs behind the product,
  // not competing with it.
  const field = `color-mix(in oklab, ${accentHex} 12%, var(--color-paper))`;

  return (
    <m.article
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      animate={{ y: hover && !reduced ? -2 : 0 }}
      transition={{ duration: dur.lift, ease }}
      className="colour-product-card group relative flex h-full flex-col rounded-card border bg-paper p-3 sm:p-4 transition-[border-color,box-shadow] duration-(--bb-duration-accent) ease-(--bb-ease-out) hover:shadow-bb focus-within:shadow-bb"
      style={{ borderColor: hover ? accentHex : 'var(--color-line)' }}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-card"
        style={{ backgroundColor: field }}
      >
        {imageUrl ? (
          <>
            <m.div
              className="absolute inset-0"
              animate={{ scale: hover && !reduced ? 1.06 : 1 }}
              transition={{ duration: dur.accent, ease }}
            >
              <Image
                src={imageUrl}
                alt={imageAlt ?? name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-contain p-3 sm:p-6"
              />
            </m.div>

            {hoverImageUrl && (
              <m.div
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: hover ? 1 : 0 }}
                transition={{ duration: dur.accent, ease }}
                aria-hidden="true"
              >
                <Image
                  src={hoverImageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-contain p-3 sm:p-6"
                />
              </m.div>
            )}
          </>
        ) : (
          // No stock photography and no placeholder art: an image-less product
          // gets an empty accent field, not a grey box with a camera glyph.
          <span className="sr-only">No photograph available</span>
        )}

        {showMrp && (
          <span className="absolute left-2 top-2 rounded-full bg-paper px-3 py-1 text-xs font-medium text-ink">Save {formatPrice((mrpPaise as number) - (pricePaise as number))}</span>
        )}

        {purchasable && onQuickAdd && (
          <m.button
            type="button"
            onClick={() => onQuickAdd(slug)}
            initial={false}
            animate={{
              y: hover || reduced ? 0 : 56,
              opacity: hover || reduced ? 1 : 0,
            }}
            transition={{ duration: dur.lift, ease }}
            // Hidden from the tab order until it is actually visible, so
            // keyboard users don't tab into an offscreen control.
            tabIndex={hover ? 0 : -1}
            aria-hidden={!hover && !reduced}
            className="btn btn-primary absolute z-10 inset-x-3 bottom-3"
          >
            Quick add
          </m.button>
        )}
      </div>

      {/* Ink, not accent — this is body text. */}
      <p className="mt-4 type-caption text-ink-soft">{brandName}</p>

      <h3 className="mt-1 type-subhead text-base sm:text-lg [overflow-wrap:anywhere]">
        <Link
          href={`/products/${slug}`}
          className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-signal"
        >
          {name}
        </Link>
      </h3>

      {size && <p className="mt-1 type-body text-ink-soft">{size}</p>}

      <p className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2 type-body" data-price>
        {purchasable ? (
          <>
            <span className="font-medium">{formatPrice(pricePaise)}</span>
            {showMrp && (
              <s className="text-ink-soft">{formatPrice(mrpPaise)}</s>
            )}
          </>
        ) : (
          <span className="text-ink-soft">{formatPrice(null)}</span>
        )}
      </p>
      <div aria-hidden="true" className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs font-medium text-signal">
        <span>View product</span><span className="arrow-nudge">↗</span>
      </div>
    </m.article>
  );
}
