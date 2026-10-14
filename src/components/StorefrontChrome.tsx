'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Nav, { type NavBrand } from '@/components/Nav';
import CartDrawer from '@/components/CartDrawer';
import CartContents from '@/components/CartContents';
import { useCartDrawer, useCartStore } from '@/lib/cart-store';

/*
  Holds the one piece of state the header and the drawer both need: whether the
  cart is open. Kept in a single client component so every page below, and
  every section on it, can stay a server component.

  The badge count is gated behind a mount flag. The cart is persisted to
  localStorage, which the server cannot see, so rendering the real count on the
  first pass would mean the server says "Cart" and the client says "Cart (3)" —
  a hydration mismatch. Zero until mounted, then the truth.
*/
export default function StorefrontChrome({ brands }: { brands: NavBrand[] }) {
  const [mounted, setMounted] = useState(false);

  const cartOpen = useCartDrawer((state) => state.open);
  const setCartOpen = useCartDrawer((state) => state.setOpen);
  const lines = useCartStore((state) => state.lines);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Any navigation closes the drawer. The store outlives the page, so without
  // this "Checkout" (a link inside the drawer) opened /checkout with the cart
  // still covering it and the form unreachable until someone found Close.
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) setCartOpen(false);
    previousPath.current = pathname;
  }, [pathname, setCartOpen]);

  const cartCount = mounted
    ? lines.reduce((total, line) => total + line.quantity, 0)
    : 0;

  return (
    <>
      <Nav brands={brands} cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)}>
        <CartContents />
      </CartDrawer>
    </>
  );
}
