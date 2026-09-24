'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { m } from 'motion/react';
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
 * The hidden state lives in `globals.css`, keyed on `data-reveal-pending`,
 * which `RevealItem` sets only once hydrated and only while below the fold.
 * So the server HTML is never hidden, the first screen never waits on a
 * script, and everything further down still rises into view on scroll.
 * `whileInView` still drives it, and Motion's inline `opacity: 1` on arrival
 * beats the stylesheet.
 */
export function Reveal({
  children,
  gap = 0.08,
  delay = 0,
  className,
}: RevealProps) {
  return (
    <m.div variants={stagger(delay, gap)} {...inView} initial={false} className={className}>
      {children}
    </m.div>
  );
}

/*
  Every RevealItem on the page measures itself in the same hydration commit.
  Reading one position and then writing an attribute before the next read
  would make the browser recompute styles once per item; so the reads happen
  in each layout effect and the writes are queued and applied together in one
  microtask — still before the first frame is painted.
*/
const pendingHide: Element[] = [];

function hideWhenBatched(element: Element) {
  if (pendingHide.length === 0) {
    queueMicrotask(() => {
      for (const item of pendingHide.splice(0)) item.setAttribute('data-reveal-pending', '');
    });
  }
  pendingHide.push(element);
}

/**
 * A single staggered child: fade plus a 24px rise.
 *
 * Hidden only if it is off screen when the page hydrates — hiding something
 * the reader cannot see yet cannot flash. Anything already on screen is left
 * exactly as the server painted it: making the first screen wait for the
 * JavaScript bundle is what held a phone's largest paint back by ~3 s. See
 * `Reveal` above for why the hidden state cannot live in `initial`.
 */
export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { top } = element.getBoundingClientRect();
    if (top >= window.innerHeight) hideWhenBatched(element);
  }, []);

  return (
    <m.div ref={ref} variants={fadeUp} initial={false} className={className}>
      {children}
    </m.div>
  );
}
