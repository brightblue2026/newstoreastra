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
 */
export function Reveal({
  children,
  gap = 0.08,
  delay = 0,
  className,
}: RevealProps) {
  return (
    <motion.div variants={stagger(delay, gap)} {...inView} className={className}>
      {children}
    </motion.div>
  );
}

/** A single staggered child: fade plus a 24px rise. */
export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}
