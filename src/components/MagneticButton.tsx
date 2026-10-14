'use client';

import { useRef, type ReactNode } from 'react';
import Link from '@/components/Link';
import {
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';

/*
  The primary CTA, and only the primary CTA. It leans up to 6px toward the
  cursor while the cursor is within the button, then springs back.

  Deliberately not applied to secondary actions: the effect reads as emphasis,
  and emphasis on everything is emphasis on nothing.
*/

const PULL = 0.28; // fraction of the cursor's offset the button travels
const MAX = 6; // px

export default function MagneticButton({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 20 });
  const springY = useSpring(y, { stiffness: 260, damping: 20 });

  const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v));

  const handleMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    // Coarse pointers have no hover state to speak of, and reduced motion opts
    // out entirely.
    if (reduced || event.pointerType !== 'mouse' || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    x.set(clamp((event.clientX - (box.left + box.width / 2)) * PULL));
    y.set(clamp((event.clientY - (box.top + box.height / 2)) * PULL));
  };

  const release = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <m.a
      // `asChild` isn't available here, so Link renders through the motion
      // anchor via legacyBehavior-free composition: m.a *is* the anchor.
      ref={ref}
      href={href}
      onPointerMove={handleMove}
      onPointerLeave={release}
      onBlur={release}
      style={{ x: springX, y: springY }}
      className={`btn btn-primary px-8 py-4 ${className}`}
    >
      {children}
    </m.a>
  );
}

/**
 * Non-magnetic sibling for secondary actions and for anywhere a real Next.js
 * client-side transition matters more than the flourish.
 */
export function SignalLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`btn btn-primary px-8 py-4 ${className}`}
    >
      {children}
    </Link>
  );
}
