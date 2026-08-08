'use client';

import { useState } from 'react';
import { useCartDrawer, useCartStore } from '@/lib/cart-store';

/**
 * Quantity stepper plus add-to-cart, for anything whose selection is already
 * settled by the time it renders — a combo with no choice slots, where the
 * buyable thing is the package itself. Products go through `ProductDetail`,
 * which has variant axes to resolve first; a combo with choice slots goes
 * through `ComboChoices`, which has fragrances to pick.
 *
 * The CTA is `--bb-signal` here as everywhere; a combo page carries no accent
 * of its own because its components come from several houses at once.
 */
export default function AddToCartButton({
  kind,
  id,
  label = 'Add to cart',
}: {
  kind: 'VARIANT' | 'COMBO';
  id: string;
  label?: string;
}) {
  const addLine = useCartStore((state) => state.addLine);
  const openCart = useCartDrawer((state) => state.setOpen);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center rounded-control border border-line">
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          aria-label="Decrease quantity"
          className="px-4 py-3 type-body text-ink-soft hover:text-ink"
        >
          &minus;
        </button>
        <span className="min-w-10 text-center tabular-nums type-body">{quantity}</span>
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.min(999, q + 1))}
          aria-label="Increase quantity"
          className="px-4 py-3 type-body text-ink-soft hover:text-ink"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          addLine({ kind, id, quantity });
          setAdded(true);
          openCart(true);
        }}
        className="flex-1 rounded-control bg-signal px-8 py-4 type-body font-medium text-paper motion-lift"
      >
        {label}
      </button>

      <p aria-live="polite" className="sr-only">
        {added ? 'Added to your cart.' : ''}
      </p>
    </div>
  );
}
