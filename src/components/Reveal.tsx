'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { fadeUp, inView, stagger } from '@/lib/motion';

type RevealProps = {
  children: ReactNode;
  /** Seconds between each child's entrance. */
  gap?: number;
  /** Seconds to wait before the first child. */
  delay?: number;
  className?: string;
};

/**
 * Section wrapper. Puts its children on a stagger so they arrive one at a time.
 * Pair with `RevealItem` — a child that is not a `RevealItem` inherits nothing
 * and simply appears.
 *
 * `initial={false}` is the important part, and it is not a style choice.
 *
 * With `initial="hidden"`, Motion writes the hidden state into the server HTML
 * as an inline `opacity: 0`. Anyone whose JavaScript is blocked, broken or
 * simply slow to arrive then sees a blank page — 31 hidden elements on the
 * homepage alone — and an inline style cannot be overridden from a stylesheet,
 * so there was no way to rescue them. `initial={false}` tells Motion to write
 * nothing and adopt whatever the element already computes to.
 *
 * The hidden state moved to `globals.css`, behind the `.js` class that
 * `layout.tsx` sets before first paint. So: no script, nothing hidden, the
 * whole page readable; script, hidden exactly as before and animated back the
 * moment it scrolls into view. `whileInView` still drives it, and Motion's
 * inline `opacity: 1` on arrival beats the stylesheet.
 */
export function Reveal({
  children,
  gap = 0.08,
  delay = 0,
  className,
}: RevealProps) {
  return (
    <motion.div variants={stagger(delay, gap)} {...inView} initial={false} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * A single staggered child: fade plus a 24px rise.
 *
 * `data-reveal` is what the stylesheet hides; see `Reveal` above for why the
 * hidden state cannot live in `initial`.
 */
export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} initial={false} data-reveal className={className}>
      {children}
    </motion.div>
  );
}
