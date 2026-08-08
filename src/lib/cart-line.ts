/**
 * The shape of a cart line, and its identity.
 *
 * Kept out of `cart-store.ts` because both the client store and the server
 * pricing path need it, and `cart-store.ts` is a `'use client'` module. Pure —
 * no React, no database, no `server-only`.
 *
 * A cart line still holds nothing priced. It holds what the customer chose:
 * which variant or combo, how many, and — for a combo with choice slots —
 * which fragrance they picked for each slot. Every rupee is still looked up
 * server-side on read (`src/lib/cart-pricing.ts`).
 */

export interface ComboChoice {
  /** `ComboItem.id` — the slot being chosen for. */
  itemId: string;
  /**
   * One variant id per unit of the slot. A slot with `quantity: 3` — "any 3
   * MX-3 fragrances" — carries three ids, and repeats are allowed, because
   * three bottles of Lemon is a legitimate pick.
   */
  variantIds: string[];
}

export interface CartLineRef {
  kind: 'VARIANT' | 'COMBO';
  id: string;
  quantity: number;
  /** Only ever set on a `COMBO` line, and only when the combo has choice slots. */
  choices?: ComboChoice[];
}

/**
 * Choices in a canonical order, so that two carts holding the same package
 * produce the same key regardless of the order the customer clicked in.
 *
 * Within a slot the picks are sorted: two Lemon and one Rose is the same
 * package however it was typed. Empty slots are dropped, and an empty result
 * becomes `undefined` — a combo without choice slots keys as plain
 * `COMBO:<id>`, which is what carts saved before pickers existed already are.
 */
export function normaliseChoices(
  choices: ComboChoice[] | undefined | null,
): ComboChoice[] | undefined {
  if (!choices || choices.length === 0) return undefined;

  const cleaned = choices
    .filter((choice) => choice.itemId && choice.variantIds.length > 0)
    .map((choice) => ({
      itemId: choice.itemId,
      variantIds: [...choice.variantIds].sort(),
    }))
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));

  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * The identity of a cart line.
 *
 * Two combo lines of the same combo with different fragrances are two
 * different things to buy, so `kind:id` alone can no longer identify a line —
 * the quantity stepper, the remove button, and the server's regrouping of
 * priced component lines all key off this.
 *
 * The separators (`:#~=.`) cannot occur in a cuid, so a key parses back
 * unambiguously even though nothing currently needs to parse one.
 */
export function cartLineKey(ref: Pick<CartLineRef, 'kind' | 'id' | 'choices'>): string {
  const base = `${ref.kind}:${ref.id}`;
  const choices = ref.kind === 'COMBO' ? normaliseChoices(ref.choices) : undefined;
  if (!choices) return base;

  const suffix = choices
    .map((choice) => `${choice.itemId}=${choice.variantIds.join('.')}`)
    .join('~');

  return `${base}#${suffix}`;
}
