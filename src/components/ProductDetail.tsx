'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { m, useReducedMotion } from 'motion/react';
import { dur, ease } from '@/lib/motion';
import { formatPrice, isPurchasable } from '@/lib/money';
import DeliveryCheck from '@/components/DeliveryCheck';
import { enquiryHref } from '@/lib/contact';
import { useCartDrawer, useCartStore } from '@/lib/cart-store';
import type { ProductPage, ProductVariantView } from '@/lib/storefront';

/*
  The buying half of a product page: gallery, the variant axes, and add to cart.

  MX-3 is fragrance × size × format, so this is a three-axis picker. Kenzaniya
  spices are size only, and an axis with a single value renders nothing rather
  than a control with one option in it.

  No axis combination is ever a dead end. Picking a fragrance that doesn't come
  in the currently selected size moves to the closest real variant instead of
  disabling the option or landing on nothing — see `pickAlong`. Every state of
  this component corresponds to a variant that actually exists.
*/

type Axis = 'size' | 'format' | 'fragrance';

function axisValue(variant: ProductVariantView, axis: Axis): string | null {
  switch (axis) {
    case 'size':
      return variant.size;
    case 'format':
      return variant.format;
    case 'fragrance':
      return variant.variantName;
  }
}

/** Distinct values along one axis, in first-seen order. */
function axisOptions(variants: ProductVariantView[], axis: Axis): string[] {
  const seen: string[] = [];
  for (const variant of variants) {
    const value = axisValue(variant, axis);
    if (value !== null && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

export default function ProductDetail({ product }: { product: ProductPage }) {
  const { variants } = product;
  const reduced = useReducedMotion();
  // The fade is for switching photos, never for the first one: Motion writes
  // `initial` into the server HTML, so fading the first photo in shipped the
  // page's largest element at opacity 0 until the bundle had hydrated — about
  // three seconds on a phone on 4G.
  const photoSwitched = useRef(false);
  useEffect(() => {
    photoSwitched.current = true;
  }, []);

  const addLine = useCartStore((state) => state.addLine);
  const openCart = useCartDrawer((state) => state.setOpen);

  // Open on something buyable. Landing on "Price on request" when a priced
  // size exists would misrepresent the product.
  const initial = useMemo(
    () => variants.find((v) => isPurchasable(v.pricePaise)) ?? variants[0] ?? null,
    [variants],
  );

  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const selected = variants.find((v) => v.id === selectedId) ?? initial;

  const sizes = axisOptions(variants, 'size');
  const formats = axisOptions(variants, 'format');
  const fragrances = axisOptions(variants, 'fragrance');

  /**
   * Move along one axis, keeping as much of the current selection as the
   * catalogue allows. Among the variants carrying the requested value, prefer
   * the one agreeing on the most other axes, and break ties toward a variant
   * that actually has a price.
   */
  function pickAlong(axis: Axis, value: string) {
    const candidates = variants.filter((v) => axisValue(v, axis) === value);
    if (candidates.length === 0) return;

    const others: Axis[] = (['size', 'format', 'fragrance'] as Axis[]).filter(
      (a) => a !== axis,
    );

    let best = candidates[0];
    let bestScore = -1;

    for (const candidate of candidates) {
      let score = 0;
      for (const other of others) {
        if (selected && axisValue(candidate, other) === axisValue(selected, other)) score += 2;
      }
      if (isPurchasable(candidate.pricePaise)) score += 1;

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    setSelectedId(best.id);
  }

  /*
    The gallery leads with the selected variant's own photograph when it has
    one — on a 24-fragrance product the bottle colour is the thing being
    chosen, so the picture has to follow the choice.
  */
  const gallery = useMemo(() => {
    const shots: { url: string; alt: string }[] = [];

    if (selected?.imageUrl) {
      shots.push({
        url: selected.imageUrl,
        alt: selected.variantName
          ? `${product.name} — ${selected.variantName}, ${selected.size}`
          : `${product.name}, ${selected.size}`,
      });
    }

    for (const image of product.images) {
      if (!shots.some((shot) => shot.url === image.url)) shots.push(image);
    }

    return shots;
  }, [selected, product.images, product.name]);

  const [imageIndex, setImageIndex] = useState(0);

  // A new variant means a new lead photograph; stay on the first frame.
  useEffect(() => {
    setImageIndex(0);
    setAdded(false);
  }, [selectedId]);

  const active = gallery[Math.min(imageIndex, gallery.length - 1)] ?? null;

  const purchasable = selected !== null && isPurchasable(selected.pricePaise);

  // Reserves room at the end of the page for the fixed buy bar below, so it
  // never covers the footer for good — see `body[data-sticky-buy-bar]` in
  // globals.css. Set after hydration; the padding lands below the fold.
  useEffect(() => {
    if (!purchasable) return;
    document.body.setAttribute('data-sticky-buy-bar', '');
    return () => document.body.removeAttribute('data-sticky-buy-bar');
  }, [purchasable]);
  const showMrp =
    purchasable &&
    selected.mrpPaise !== null &&
    selected.mrpPaise > (selected.pricePaise as number);

  const accent = selected?.variantHex ?? product.brand.accentHex;

  function handleAdd() {
    if (!selected || !purchasable) return;
    addLine({ kind: 'VARIANT', id: selected.id, quantity });
    setAdded(true);
    openCart(true);
  }

  const priceBlock = (
    <div>
      {purchasable ? (
        <p className="type-display-sm tabular-nums" data-price>
          {formatPrice(selected.pricePaise)}
          {showMrp && (
            <s className="ml-3 type-body-lg text-ink-soft">{formatPrice(selected.mrpPaise)}</s>
          )}
        </p>
      ) : (
        <div>
          {/* Never ₹0.00. Most of this catalogue has no published price yet,
              and the enquiry link is the conversion path for all of it. */}
          <p className="type-heading text-ink-soft" data-price>
            {formatPrice(null)}
          </p>
          <a
            href={enquiryHref(product.name, selected?.sku)}
            className="mt-2 inline-block type-body underline"
          >
            Enquire about this product
          </a>
        </div>
      )}
    </div>
  );

  return (
    <div
      // `grid-cols-1` is `minmax(0, 1fr)`: without it the single mobile column
      // took the thumbnail strip's full width as its minimum — four thumbnails
      // are wider than a 360px phone — and the whole page scrolled sideways.
      className="grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-10 lg:gap-16"
      style={{ ['--bb-accent' as string]: accent }}
    >
      {/* ---------------------------------------------------------- gallery */}
      <div>
        <div
          className="relative aspect-square overflow-hidden rounded-card"
          style={{
            backgroundColor: `color-mix(in oklab, ${accent} 10%, var(--color-paper))`,
          }}
        >
          {active ? (
            <m.div
              key={active.url}
              className="absolute inset-0"
              initial={reduced || !photoSwitched.current ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: dur.accent, ease }}
            >
              <Image
                src={active.url}
                alt={active.alt}
                fill
                priority
                // Minus the page gutters and this box's own p-12 on a phone.
                sizes="(max-width: 767px) calc(100vw - 9rem), 50vw"
                className="object-contain p-12"
              />
            </m.div>
          ) : (
            // No stock photography, no placeholder art — an empty accent field.
            <span className="sr-only">No photograph available</span>
          )}
        </div>

        {gallery.length > 1 && (
          <ul className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {gallery.map((shot, index) => (
              <li key={shot.url}>
                <button
                  type="button"
                  onClick={() => setImageIndex(index)}
                  aria-label={`Show image ${index + 1} of ${gallery.length}`}
                  aria-current={index === imageIndex ? 'true' : undefined}
                  className={`relative size-20 shrink-0 overflow-hidden rounded-control border ${
                    index === imageIndex ? 'border-ink' : 'border-line'
                  }`}
                >
                  <Image
                    src={shot.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-contain p-2"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------------- buy */}
      <div>
        <p className="type-caption text-ink-soft">{product.brand.name}</p>
        <h1 className="mt-4 type-display-sm">{product.name}</h1>
        <p className="mt-6 type-body-lg text-ink-soft">{product.shortDesc}</p>

        <div className="mt-8">{priceBlock}</div>

        {selected && (
          <p className="mt-3 type-mono text-ink-soft">
            {selected.sku}
            {selected.format && ` · ${selected.format}`}
          </p>
        )}

        {/* ------------------------------------------------- fragrance grid */}
        {fragrances.length > 1 && (
          <fieldset className="mt-12">
            <legend className="type-caption text-ink-soft">
              Fragrance
              <span className="ml-2 tabular-nums">{fragrances.length}</span>
            </legend>

            <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
              {fragrances.map((fragrance) => {
                const swatch = variants.find((v) => v.variantName === fragrance);
                const isSelected = selected?.variantName === fragrance;

                return (
                  <button
                    key={fragrance}
                    type="button"
                    onClick={() => pickAlong('fragrance', fragrance)}
                    aria-pressed={isSelected}
                    className="group flex flex-col items-center gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-10 rounded-full border-2 motion-accent ${
                        isSelected ? 'border-ink' : 'border-transparent group-hover:border-line'
                      }`}
                      style={{
                        backgroundColor: swatch?.variantHex ?? 'var(--color-line)',
                      }}
                    />
                    <span
                      className={`text-center type-caption ${
                        isSelected ? 'text-ink' : 'text-ink-soft'
                      }`}
                    >
                      {fragrance}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* ------------------------------------------------------ size axis */}
        {sizes.length > 1 && (
          <fieldset className="mt-10">
            <legend className="type-caption text-ink-soft">Size</legend>
            <div className="mt-4 flex flex-wrap gap-3">
              {sizes.map((size) => {
                const isSelected = selected?.size === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => pickAlong('size', size)}
                    aria-pressed={isSelected}
                    className={`min-h-11 rounded-control border px-4 py-2 type-body motion-accent ${
                      isSelected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line text-ink-soft hover:border-ink hover:text-ink'
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* ---------------------------------------------------- format axis */}
        {formats.length > 1 && (
          <fieldset className="mt-10">
            <legend className="type-caption text-ink-soft">Format</legend>
            <div className="mt-4 flex flex-wrap gap-3">
              {formats.map((format) => {
                const isSelected = selected?.format === format;
                return (
                  <button
                    key={format}
                    type="button"
                    onClick={() => pickAlong('format', format)}
                    aria-pressed={isSelected}
                    className={`min-h-11 rounded-control border px-4 py-2 type-body motion-accent ${
                      isSelected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line text-ink-soft hover:border-ink hover:text-ink'
                    }`}
                  >
                    {format}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* ------------------------------------------------------ add to cart */}
        {purchasable && (
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-control border border-line">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="min-w-11 px-4 py-3 type-body text-ink-soft hover:text-ink"
              >
                &minus;
              </button>
              <span className="min-w-10 text-center tabular-nums type-body">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                aria-label="Increase quantity"
                className="min-w-11 px-4 py-3 type-body text-ink-soft hover:text-ink"
              >
                +
              </button>
            </div>

            {/* The CTA is --bb-signal on every brand. Never the accent. */}
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 rounded-control bg-signal px-8 py-4 type-body font-medium text-paper motion-lift"
            >
              Add to cart
            </button>
          </div>
        )}

        {purchasable && <DeliveryCheck variantId={selected.id} />}

        <p aria-live="polite" className="sr-only">
          {added && selected ? `${product.name} added to your cart.` : ''}
        </p>

        {product.claims.length > 0 && (
          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3">
            {product.claims.map((claim) => (
              <li key={claim.label} className="type-caption text-ink-soft">
                {claim.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        Sticky mobile add-to-cart. Always present on small screens rather than
        appearing once the main button scrolls away: a bar that materialises
        mid-scroll shifts what is under the thumb.
      */}
      {purchasable && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-safe safe-x backdrop-blur-md md:hidden"
        >
          <div className="flex items-center gap-4 px-6 pt-3">
            <div className="min-w-0">
              <p className="truncate type-caption text-ink-soft">
                {selected?.variantName ? `${selected.variantName} · ` : ''}
                {selected?.size}
              </p>
              <p className="type-body font-medium tabular-nums" data-price>
                {formatPrice(selected.pricePaise)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="ml-auto rounded-control bg-signal px-6 py-3 type-body font-medium text-paper"
            >
              Add to cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
