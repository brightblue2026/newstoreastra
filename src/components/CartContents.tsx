'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence } from 'motion/react';
import { CartLine } from '@/components/CartDrawer';
import { cartLineKey } from '@/lib/cart-line';
import { useCartStore } from '@/lib/cart-store';
import { formatINR } from '@/lib/money';
import { readCart, type CartView } from '@/server/actions/cart';

/*
  The cart drawer's contents.

  The store holds ids, quantities and combo choices; every rupee on this screen
  comes back from `readCart`, which re-reads each price from Postgres. That is
  the whole point — nothing here is priced client-side, so nothing here can be
  tampered into a cheaper order.

  Quantity edits are optimistic in the store and settle when the recomputation
  returns. The previous totals stay on screen while that happens rather than
  flashing to zero: a cart that blanks on every "+" reads as broken.
*/
export default function CartContents() {
  const lines = useCartStore((state) => state.lines);
  const discountCode = useCartStore((state) => state.discountCode);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeLine = useCartStore((state) => state.removeLine);
  const setDiscountCode = useCartStore((state) => state.setDiscountCode);

  const [view, setView] = useState<CartView | null>(null);
  const [failed, setFailed] = useState(false);
  const [codeDraft, setCodeDraft] = useState('');

  useEffect(() => {
    if (lines.length === 0) {
      setView(null);
      setFailed(false);
      return;
    }

    let cancelled = false;

    readCart({ lines, ...(discountCode ? { discountCode } : {}) })
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn('[cart] could not price the cart:', error);
        setFailed(true);
      });

    // A quantity changed before the last recomputation came back — drop the
    // stale answer rather than letting it overwrite the newer one.
    return () => {
      cancelled = true;
    };
  }, [lines, discountCode]);

  if (lines.length === 0) {
    return (
      <CartLine>
        <p className="type-body text-ink-soft">Your cart is empty.</p>
        <Link href="/shop" className="mt-4 inline-block type-body underline">
          Browse the catalogue
        </Link>
      </CartLine>
    );
  }

  if (failed && view === null) {
    return (
      <CartLine>
        <p className="type-body text-ink-soft">
          We couldn&rsquo;t price your cart just now. Your items are saved — please try again
          in a moment.
        </p>
      </CartLine>
    );
  }

  if (view === null) {
    return (
      <CartLine>
        <p className="type-body text-ink-soft">Pricing your cart…</p>
      </CartLine>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <AnimatePresence initial={false}>
          {view.lines.map((line) => (
            <CartLine key={line.key}>
              <div className="flex gap-4">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-sky">
                  {line.imageUrl && (
                    <Image
                      src={line.imageUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-contain p-1"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="type-body">
                    {line.slug ? (
                      <Link
                        href={
                          line.kind === 'COMBO'
                            ? `/combos/${line.slug}`
                            : `/products/${line.slug}`
                        }
                        className="hover:underline"
                      >
                        {line.name}
                      </Link>
                    ) : (
                      line.name
                    )}
                  </p>

                  {line.sku && <p className="mt-1 type-mono text-ink-soft">{line.sku}</p>}

                  {/* What they picked for each choice slot. Two lines of the
                      same combo with different fragrances are two rows, so
                      this is the only thing telling them apart. */}
                  {line.choices?.map((choice) => (
                    <p key={choice.slotLabel} className="mt-1 type-caption text-ink-soft">
                      {choice.slotLabel}: {choice.picks.join(', ')}
                    </p>
                  ))}

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center rounded-control border border-line">
                      <button
                        type="button"
                        onClick={() => setQuantity(line.key, line.quantity - 1)}
                        aria-label={`Decrease quantity of ${line.name}`}
                        className="px-3 py-1 type-body text-ink-soft hover:text-ink"
                      >
                        &minus;
                      </button>
                      <span className="min-w-8 text-center tabular-nums type-body">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(line.key, line.quantity + 1)}
                        aria-label={`Increase quantity of ${line.name}`}
                        className="px-3 py-1 type-body text-ink-soft hover:text-ink"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="type-caption text-ink-soft hover:text-ink"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <p className="type-body font-medium tabular-nums" data-price>
                    {formatINR(line.netPaise)}
                  </p>
                  {line.discountPaise > 0 && (
                    <p className="mt-1 type-caption text-ink-soft line-through tabular-nums">
                      {formatINR(line.subtotalPaise)}
                    </p>
                  )}
                </div>
              </div>
            </CartLine>
          ))}
        </AnimatePresence>

        {/* An item that went out of stock or unpublished while it sat in the
            cart — or a combo whose chosen fragrance is no longer offered.
            Named, not silently dropped and not silently substituted. */}
        {view.unavailable.length > 0 && (
          <CartLine>
            <p className="type-body text-warning">
              {view.unavailable.length === 1
                ? 'One item is no longer available and has not been priced.'
                : `${view.unavailable.length} items are no longer available and have not been priced.`}
            </p>
            <button
              type="button"
              onClick={() => {
                for (const line of view.unavailable) removeLine(cartLineKey(line));
              }}
              className="mt-2 type-caption underline"
            >
              Remove them
            </button>
          </CartLine>
        )}
      </div>

      <div className="sticky bottom-0 mt-4 border-t border-line bg-paper pt-4">
        {view.freeShippingProgress && view.freeShippingProgress.remainingPaise > 0 && (
          <div className="mb-4">
            <p className="type-caption text-ink-soft">
              {formatINR(view.freeShippingProgress.remainingPaise)} away from free delivery
            </p>
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={view.freeShippingProgress.thresholdPaise}
              aria-valuenow={view.subtotalPaise}
            >
              <div
                className="h-full bg-signal"
                style={{
                  width: `${Math.min(
                    100,
                    (view.subtotalPaise / view.freeShippingProgress.thresholdPaise) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {view.freeShippingProgress && view.freeShippingProgress.remainingPaise === 0 && (
          <p className="mb-4 type-caption text-success">Free delivery unlocked.</p>
        )}

        {/*
          Coupon entry.

          The code is held in the cart store, not in this component, so it
          survives navigation and a reload the same way the lines do — and it
          is only ever a string the customer typed. Whether it means anything
          is decided by `calculateCart`, which reports `invalidDiscountCode`
          when a code was supplied and no usable discount answered to it. That
          covers a code that doesn't exist, one that has expired, one that has
          not started, one that is out of uses, and one whose minimum order the
          cart doesn't meet — all of which look the same from here, so the
          message says the code isn't valid *for this cart* rather than
          claiming it doesn't exist.
        */}
        <div className="mb-4 border-b border-line pb-4">
          {discountCode ? (
            <div className="flex items-center justify-between gap-3">
              <p className="type-caption text-ink-soft">
                Code <span className="type-mono text-ink">{discountCode}</span>
                {view.invalidDiscountCode && ' — not valid for this cart'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDiscountCode(null);
                  setCodeDraft('');
                }}
                className="type-caption underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const code = codeDraft.trim().toUpperCase();
                if (code) setDiscountCode(code);
              }}
              className="flex gap-2"
            >
              <label htmlFor="cart-coupon" className="sr-only">
                Discount code
              </label>
              <input
                id="cart-coupon"
                name="coupon"
                value={codeDraft}
                onChange={(event) => setCodeDraft(event.target.value)}
                placeholder="Discount code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-control border border-line px-3 py-2 type-caption uppercase placeholder:normal-case placeholder:text-ink-soft"
              />
              <button
                type="submit"
                disabled={codeDraft.trim().length === 0}
                className="rounded-control border border-ink px-4 py-2 type-caption disabled:opacity-40"
              >
                Apply
              </button>
            </form>
          )}
        </div>

        {/* Named offers — `Discount.publicLabel`, never the internal name. */}
        {view.appliedDiscounts.map((discount) => (
          <div key={discount.id} className="mb-2 flex justify-between type-body">
            <span className="text-success">{discount.label}</span>
            <span className="tabular-nums text-success">
              &minus;{formatINR(discount.amountPaise)}
            </span>
          </div>
        ))}

        <div className="flex justify-between type-body-lg">
          <span>Subtotal</span>
          <span className="font-medium tabular-nums" data-price>
            {formatINR(view.totalPaise)}
          </span>
        </div>

        <p className="mt-2 type-caption text-ink-soft">
          Delivery and taxes are calculated at checkout.
        </p>

        {/*
          Checkout is a link, not a button that posts: the cart it carries is
          already in the store, and the checkout page re-prices everything from
          Postgres on arrival anyway. An item that went unavailable while the
          drawer was open blocks the way through — the alternative is a customer
          discovering it after filling in an address.
        */}
        <Link
          href="/checkout"
          aria-disabled={view.lines.length === 0}
          className={`mt-4 block rounded-control bg-signal px-8 py-4 text-center type-body font-medium text-paper motion-lift ${
            view.lines.length === 0 ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}
