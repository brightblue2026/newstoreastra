'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { dur, ease } from '@/lib/motion';

/*
  Counts up when it scrolls into view. Built for one number in particular:
  24 — the fragrance variants of MX-3 that hold the International Book of
  Records. It is the only genuinely unusual figure in the business, so it gets
  the only count-up on the site.

  Three decisions here were each arrived at by watching this fail:

  1. It renders `to`, not 0.
     The server has no viewport and never runs the animation, so starting at 0
     ships "0 fragrance variants" in the HTML — the opposite of the claim — and
     leaves it there for anyone whose JS never arrives. The value is correct in
     the markup; the animation is layered on top.

  2. It only winds back to 0 when it starts below the fold.
     Winding back unconditionally means a tall viewport paints the real figure
     and then visibly rewinds it. A count-up already on screen at load has
     nothing to reveal, so it stays put.

  3. Viewport detection polls the element's rect on rAF.
     `useInView`, `onViewportEnter` and a hand-rolled IntersectionObserver were
     all tried, and none of them fired for this element while Lenis was driving
     the scroll — the same IO fires correctly on the page with Lenis disabled.
     Rather than ship a hero stat that depends on that, this reads the rect on
     the frame loop. It is one `getBoundingClientRect` per frame for one
     element, it stops the moment it fires, and it cannot be broken by anything
     a scroll library does to the frame pipeline.
*/
export default function CountUp({
  to,
  suffix = '',
  className = '',
}: {
  to: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  const [n, setN] = useState(to);
  const armed = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;

    // Reduced motion never animates; the figure is already correct.
    if (reduced) {
      done.current = true;
      setN(to);
      return;
    }

    // Already on screen at load — nothing to reveal, leave it alone.
    if (el.getBoundingClientRect().top <= window.innerHeight) {
      done.current = true;
      return;
    }

    armed.current = true;
    setN(0);

    let frame = 0;
    const tick = () => {
      if (done.current) return;
      // Fire once the element is 80px inside the viewport, matching the
      // `-100px` bias the section reveals use: underway before it is read.
      if (el.getBoundingClientRect().top <= window.innerHeight - 80) {
        done.current = true;
        animate(0, to, {
          // Longer than a section reveal on purpose: the number is the content
          // here, not the transition, and needs time to be read as it climbs.
          duration: dur.reveal * 2.8,
          ease,
          onUpdate: (v) => setN(Math.round(v)),
        });
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [to, reduced]);

  return (
    <span
      ref={ref}
      className={`inline-block tabular-nums ${className}`}
      // Assistive tech gets the destination, never the intermediate ticks.
      role="img"
      aria-label={`${to}${suffix}`}
    >
      <span aria-hidden="true">
        {n}
        {suffix}
      </span>
    </span>
  );
}
