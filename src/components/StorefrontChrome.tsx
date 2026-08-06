'use client';

import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import Nav, { type NavBrand } from '@/components/Nav';
import CartDrawer, { CartLine } from '@/components/CartDrawer';

/*
  Holds the one piece of state the header and the drawer both need: whether the
  cart is open. Kept in a single client component so the page itself, and every
  section on it, can stay a server component.

  The cart contents are Phase 4 — this wires the shell and the interaction, and
  renders the empty state until there is a cart to read.
*/
export default function StorefrontChrome({ brands }: { brands: NavBrand[] }) {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <>
      <Nav brands={brands} onOpenCart={() => setCartOpen(true)} />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)}>
        <AnimatePresence initial={false}>
          <CartLine key="empty">
            <p className="type-body text-ink-soft">Your cart is empty.</p>
          </CartLine>
        </AnimatePresence>
      </CartDrawer>
    </>
  );
}
