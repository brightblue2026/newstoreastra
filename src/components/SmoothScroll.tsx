'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/*
  Mounted once, in the root layout. Every scroll-triggered animation on the site
  inherits its quality from this — the reveals, the parallax and the pinned
  sequence all read as sluggish or abrupt depending on what the wheel does here.

  Renders nothing.
*/
export default function SmoothScroll() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    let lenis: Lenis | null = null;
    let frame = 0;

    const start = () => {
      if (lenis) return;
      lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      const raf = (time: number) => {
        lenis?.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      lenis?.destroy();
      lenis = null;
    };

    // Honour the preference on mount and if it changes mid-session — someone
    // toggling the OS setting should not have to reload to be taken seriously.
    const sync = () => (query.matches ? stop() : start());
    sync();
    query.addEventListener('change', sync);

    return () => {
      query.removeEventListener('change', sync);
      stop();
    };
  }, []);

  return null;
}
