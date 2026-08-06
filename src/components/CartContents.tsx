'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence } from 'motion/react';
import { CartLine } from '@/components/CartDrawer';
import { useCartStore } from '@/lib/cart-store';
import { formatINR } from '@/lib/money';
import { readCart, type CartView } from '@/server/actions/cart';

/*
  The cart drawer's contents.

  The store holds ids and quantities; every rupee on this screen comes back
  from `readCart`, which re-reads each price from Postgres. That is the whole
  point — nothing here is priced client-side, so nothing here can be tampered
  into a cheaper order.

  Quantity edits are optimistic in the store and settle when the recomputation
  returns. The previous totals stay on screen while that happens rather than
  flashing to zero: a cart that blanks on every "+" reads as broken.
*/
export default function CartContents() {
  const lines = useCartStore((state) => state.lines);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeLine = useCartStore((state) => state.removeLine);

  const [view, setView] = useState<CartView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (lines.length === 0) {
      setView(null);
      setFailed(false);
      return;
    }

    let cancelled = false;

    readCart({ lines })
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
  }, [lines]);

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
            <CartLine key={`${line.kind}:${line.id}`}>
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

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center rounded-control border border-line">
                      <button
                        type="button"
                        onClick={() => setQuantity(line.kind, line.id, line.quantity - 1)}
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
                        onClick={() => setQuantity(line.kind, line.id, line.quantity + 1)}
                        aria-label={`Increase quantity of ${line.name}`}
                        className="px-3 py-1 type-body text-ink-soft hover:text-ink"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(line.kind, line.id)}
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
            cart. Named, not silently dropped. */}
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
                for (const line of view.unavailable) removeLine(line.kind, line.id);
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
          No checkout button yet. Checkout, payment and the order transaction
          are Phase 5; a button that goes nowhere is worse than none, and this
          drawer is honest about where the build has got to.
        */}
      </div>
    </div>
  );
}
