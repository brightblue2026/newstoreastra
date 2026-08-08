/**
 * Resolving a customer's combo choices into what actually ships.
 *
 * Split out of `cart-pricing.ts` and kept pure — no database, no `server-only`
 * — because this is where a tampered cart is caught, and that deserves tests
 * that do not need Postgres to run. `cart-pricing.ts` does the fetching; this
 * decides whether what came back is a package BBTC actually offers.
 */

import type { CartLineRef } from './cart-line';

/** A variant row as choice resolution needs it. */
export interface ChoiceVariant {
  id: string;
  productId: string;
  variantName: string | null;
  isActive: boolean;
  pricePaise: number | null;
  product: {
    name: string;
    slug: string;
    isActive: boolean;
    brandId: string;
    categoryId: string;
    hsnCode: string | null;
    gstRate: number | null;
  };
}

export interface ChoiceComboItem<V extends ChoiceVariant = ChoiceVariant> {
  id: string;
  quantity: number;
  isChoice: boolean;
  /** Restricts the slot; empty means any variant of the slot's own product (§7). */
  choiceOf: string[];
  variant: V;
}

/*
  Generic over the variant row, not fixed to `ChoiceVariant`.

  This module only needs the fields `ChoiceVariant` names to decide whether a
  package is one BBTC offers. Its caller needs more from the *same rows* — a
  SKU, a weight and an image to snapshot onto an `OrderItem` — and threading
  the row type through means it gets them back with those fields intact,
  instead of a cast that would quietly become a lie if the query ever changed.
*/
export interface ResolvedCombo<V extends ChoiceVariant = ChoiceVariant> {
  /** What ships, grouped: one entry per distinct variant, with how many of it. */
  units: { variant: V; units: number }[];
  /** What to print in the cart, per choice slot. Empty when nothing was chosen. */
  chosenLabels: { slotLabel: string; picks: string[] }[];
}

/**
 * What a combo cart line actually contains, once the customer's choices are
 * applied — and `null` if any of them no longer holds.
 *
 * A choice is only honoured if the variant is active, its product is active,
 * and it is genuinely offered for that slot: inside `choiceOf` when the admin
 * restricted the slot, otherwise any variant of the slot's own product, which
 * is what §7's "empty = any in product" means. The count has to match the slot
 * size too, so "any 3 fragrances" cannot be redeemed for four.
 *
 * Returning `null` rather than substituting the slot's default is deliberate.
 * The three ways to get here — a fragrance deactivated, a slot resized since
 * the line was added, a forged payload — all have the same honest fix: the
 * customer picks again. Silently shipping a different fragrance from the one
 * on screen would be worse than saying the line needs attention.
 *
 * A line with no `choices` at all is not an error. It is a combo without
 * choice slots, or a cart saved before pickers existed; those fall back to the
 * slot's own variant, which is exactly what was being sold before.
 */
export function resolveComboUnits<V extends ChoiceVariant>(
  items: ChoiceComboItem<V>[],
  cartLine: Pick<CartLineRef, 'choices'>,
  variantById: ReadonlyMap<string, V>,
): ResolvedCombo<V> | null {
  const choiceByItem = new Map((cartLine.choices ?? []).map((choice) => [choice.itemId, choice]));

  // A choice naming a slot this combo does not have is a stale or forged line.
  for (const itemId of choiceByItem.keys()) {
    if (!items.some((item) => item.id === itemId)) return null;
  }

  const units: { variant: V; units: number }[] = [];
  const chosenLabels: { slotLabel: string; picks: string[] }[] = [];

  for (const item of items) {
    const choice = choiceByItem.get(item.id);

    // A choice sent for a fixed slot is not a slot the customer may decide.
    if (choice && !item.isChoice) return null;

    if (!choice) {
      units.push({ variant: item.variant, units: item.quantity });
      continue;
    }

    if (choice.variantIds.length !== item.quantity) return null;

    const allowed = new Set(item.choiceOf);
    const picks: string[] = [];
    const countByVariant = new Map<string, number>();

    for (const variantId of choice.variantIds) {
      const variant = variantById.get(variantId);
      if (!variant || !variant.isActive || !variant.product.isActive) return null;

      const offered =
        allowed.size > 0 ? allowed.has(variant.id) : variant.productId === item.variant.productId;
      if (!offered) return null;

      countByVariant.set(variantId, (countByVariant.get(variantId) ?? 0) + 1);
      picks.push(variant.variantName ?? 'Variant');
    }

    for (const [variantId, count] of countByVariant) {
      units.push({ variant: variantById.get(variantId)!, units: count });
    }

    // Labelled by the slot's product — "MX-3 Dishwash Liquid: Lemon, Rose" —
    // rather than "Slot 2", which means nothing to whoever is buying.
    chosenLabels.push({ slotLabel: item.variant.product.name, picks });
  }

  return { units, chosenLabels };
}
