'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The cart holds IDs and quantities only — never a price. Brief §12 Phase 3
 * is explicit about this: prices are always recomputed server-side on read
 * (`src/lib/pricing.ts`), so a value stored here can never become the value
 * charged. Persisted to localStorage so the cart survives a reload; that is
 * safe precisely because there is nothing here worth tampering with.
 */
export interface CartLineRef {
  kind: 'VARIANT' | 'COMBO';
  id: string;
  quantity: number;
}

interface CartState {
  lines: CartLineRef[];
  addLine: (kind: CartLineRef['kind'], id: string, quantity?: number) => void;
  removeLine: (kind: CartLineRef['kind'], id: string) => void;
  setQuantity: (kind: CartLineRef['kind'], id: string, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],

      addLine: (kind, id, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.kind === kind && l.id === id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.kind === kind && l.id === id ? { ...l, quantity: l.quantity + quantity } : l,
              ),
            };
          }
          return { lines: [...state.lines, { kind, id, quantity }] };
        }),

      removeLine: (kind, id) =>
        set((state) => ({
          lines: state.lines.filter((l) => !(l.kind === kind && l.id === id)),
        })),

      setQuantity: (kind, id, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { lines: state.lines.filter((l) => !(l.kind === kind && l.id === id)) };
          }
          return {
            lines: state.lines.map((l) => (l.kind === kind && l.id === id ? { ...l, quantity } : l)),
          };
        }),

      clear: () => set({ lines: [] }),
    }),
    { name: 'bb-cart' },
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
