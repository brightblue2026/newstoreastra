'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cartLineKey, normaliseChoices, type CartLineRef } from '@/lib/cart-line';

export type { CartLineRef, ComboChoice } from '@/lib/cart-line';

/**
 * The cart holds IDs, quantities and the customer's combo choices — never a
 * price. Brief §12 Phase 3 is explicit about this: prices are always
 * recomputed server-side on read (`src/lib/cart-pricing.ts`), so a value
 * stored here can never become the value charged. Persisted to localStorage so
 * the cart survives a reload; that is safe precisely because there is nothing
 * here worth tampering with. A tampered *choice* is a different matter and is
 * re-validated against the combo's own slot restrictions on the server.
 *
 * Lines are addressed by `cartLineKey`, not by id: two lines of the same combo
 * with different fragrances are two different things in the cart.
 */

interface CartState {
  lines: CartLineRef[];
  /** The coupon the customer typed. Not a price — the server decides if it applies. */
  discountCode: string | null;
  addLine: (ref: CartLineRef) => void;
  removeLine: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  setDiscountCode: (code: string | null) => void;
  clear: () => void;
}

/** Drops anything a hand-edited or pre-choices localStorage payload got wrong. */
function sanitiseLines(value: unknown): CartLineRef[] {
  if (!Array.isArray(value)) return [];

  const lines: CartLineRef[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const line = raw as Partial<CartLineRef>;
    if (line.kind !== 'VARIANT' && line.kind !== 'COMBO') continue;
    if (typeof line.id !== 'string' || line.id.length === 0) continue;
    if (!Number.isInteger(line.quantity) || (line.quantity as number) < 1) continue;

    const choices = Array.isArray(line.choices)
      ? normaliseChoices(
          line.choices.filter(
            (choice): choice is { itemId: string; variantIds: string[] } =>
              typeof choice === 'object' &&
              choice !== null &&
              typeof (choice as { itemId?: unknown }).itemId === 'string' &&
              Array.isArray((choice as { variantIds?: unknown }).variantIds) &&
              (choice as { variantIds: unknown[] }).variantIds.every((id) => typeof id === 'string'),
          ),
        )
      : undefined;

    lines.push({
      kind: line.kind,
      id: line.id,
      quantity: Math.min(999, line.quantity as number),
      ...(choices ? { choices } : {}),
    });
  }
  return lines;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      discountCode: null,

      addLine: (ref) =>
        set((state) => {
          const choices = normaliseChoices(ref.choices);
          const line: CartLineRef = {
            kind: ref.kind,
            id: ref.id,
            quantity: ref.quantity,
            ...(ref.kind === 'COMBO' && choices ? { choices } : {}),
          };
          const key = cartLineKey(line);

          const existing = state.lines.find((l) => cartLineKey(l) === key);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                cartLineKey(l) === key
                  ? { ...l, quantity: Math.min(999, l.quantity + line.quantity) }
                  : l,
              ),
            };
          }
          return { lines: [...state.lines, line] };
        }),

      removeLine: (key) =>
        set((state) => ({ lines: state.lines.filter((l) => cartLineKey(l) !== key) })),

      setQuantity: (key, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { lines: state.lines.filter((l) => cartLineKey(l) !== key) };
          }
          return {
            lines: state.lines.map((l) =>
              cartLineKey(l) === key ? { ...l, quantity: Math.min(999, quantity) } : l,
            ),
          };
        }),

      setDiscountCode: (code) => set({ discountCode: code }),

      clear: () => set({ lines: [], discountCode: null }),
    }),
    {
      name: 'bb-cart',
      // v1 lines were `{ kind, id, quantity }` with no choices and no coupon.
      // Those are still valid lines, so the migration only sanitises.
      version: 2,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<CartState>;
        return {
          ...state,
          lines: sanitiseLines(state.lines),
          discountCode: typeof state.discountCode === 'string' ? state.discountCode : null,
        } as CartState;
      },
    },
  ),
);

/**
 * Whether the cart drawer is open.
 *
 * Separate from the cart itself, and deliberately not persisted: "the drawer
 * was open when I closed the tab" is not state worth restoring. It lives in a
 * store rather than in `StorefrontChrome`'s local state because "add to cart"
 * fires from a product page far down the tree and has to be able to open it.
 */
interface CartDrawerState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useCartDrawer = create<CartDrawerState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
