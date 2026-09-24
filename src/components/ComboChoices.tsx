'use client';

import { useState } from 'react';
import { useCartDrawer, useCartStore, type ComboChoice } from '@/lib/cart-store';

/*
  Per-slot fragrance pickers for a combo — brief §12 Phase 4.

  A combo can contain fixed components and choice slots side by side. Only the
  choice slots appear here; the fixed ones are described by the page's
  "What's inside" section, which is server-rendered and needs no interaction.

  A slot with `quantity: 3` — "any 3 MX-3 fragrances" — asks three times, and
  the same fragrance may be picked more than once, because three bottles of
  Lemon is a real order. Every slot starts on its first option, so the button
  is never blocked on a decision the customer doesn't want to make, and the
  default is a package that genuinely exists.

  Nothing here is priced. The picks travel to the server as ids on the cart
  line and are re-checked there against the slot's own `choiceOf` restriction
  before they can affect what is sold.
*/

export type ChoiceSlot = {
  itemId: string;
  quantity: number;
  productName: string;
  options: { id: string; variantName: string | null; variantHex: string | null }[];
};

export default function ComboChoices({
  comboId,
  slots,
  label = 'Add combo to cart',
}: {
  comboId: string;
  slots: ChoiceSlot[];
  label?: string;
}) {
  const addLine = useCartStore((state) => state.addLine);
  const openCart = useCartDrawer((state) => state.setOpen);

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [picks, setPicks] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      slots.map((slot) => [
        slot.itemId,
        Array.from({ length: slot.quantity }, () => slot.options[0]?.id ?? ''),
      ]),
    ),
  );

  // A slot whose product has no active variants left has nothing to pick from.
  // The package cannot be assembled, so the button goes rather than offering
  // an order that would be rejected on read.
  const unpickable = slots.some((slot) => slot.options.length === 0);

  function setPick(itemId: string, index: number, variantId: string) {
    setPicks((current) => {
      const next = [...(current[itemId] ?? [])];
      next[index] = variantId;
      return { ...current, [itemId]: next };
    });
    setAdded(false);
  }

  function handleAdd() {
    if (unpickable) return;

    const choices: ComboChoice[] = slots.map((slot) => ({
      itemId: slot.itemId,
      variantIds: picks[slot.itemId] ?? [],
    }));

    addLine({ kind: 'COMBO', id: comboId, quantity, choices });
    setAdded(true);
    openCart(true);
  }

  return (
    <div>
      {slots.map((slot) => (
        <fieldset key={slot.itemId} className="mt-8 first:mt-0">
          <legend className="type-caption text-ink-soft">
            {slot.quantity > 1
              ? `Choose ${slot.quantity} — ${slot.productName}`
              : `Choose your ${slot.productName}`}
          </legend>

          {slot.options.length === 0 ? (
            <p className="mt-3 type-body text-ink-soft">
              Nothing in this range is available to pick right now.
            </p>
          ) : (
            Array.from({ length: slot.quantity }, (_, index) => (
              <div key={index} className="mt-4">
                {slot.quantity > 1 && (
                  <p className="type-caption text-ink-soft">Bottle {index + 1}</p>
                )}

                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup"
                  aria-label={
                    slot.quantity > 1
                      ? `${slot.productName}, choice ${index + 1} of ${slot.quantity}`
                      : slot.productName
                  }
                >
                  {slot.options.map((option) => {
                    const selected = picks[slot.itemId]?.[index] === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPick(slot.itemId, index, option.id)}
                        className={`flex items-center gap-2 rounded-full border px-4 py-2 type-caption transition-colors ${
                          selected ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ backgroundColor: option.variantHex ?? 'var(--color-line)' }}
                        />
                        {option.variantName ?? 'Variant'}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </fieldset>
      ))}

      <div className="mt-10 flex flex-wrap items-center gap-4">
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

        {unpickable ? (
          <p className="type-body text-ink-soft">
            This combo is temporarily unavailable while a component is out of range.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleAdd}
            className="flex-1 rounded-control bg-signal px-8 py-4 type-body font-medium text-paper motion-lift"
          >
            {label}
          </button>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {added ? 'Added to your cart.' : ''}
      </p>
    </div>
  );
}
