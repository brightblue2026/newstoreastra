import type { Variants } from 'motion/react';

/*
  Motion primitives — the JS half of the budget declared in globals.css.

  One curve and four durations exist in this project. They are defined as CSS
  custom properties (`--bb-ease-out`, `--bb-duration-*`) for anything that can
  animate in CSS, and mirrored here for anything driven by Motion. The two
  halves must not drift: change a value in one place and change it in the other.

  There are no ad-hoc timings. If a new interaction seems to need a fifth
  duration, it almost certainly wants an existing one.
*/

/** `cubic-bezier(0.16, 1, 0.3, 1)` — expo-out. The only curve in the system. */
export const ease = [0.16, 1, 0.3, 1] as const;

/** Seconds, mirroring `--bb-duration-*`. Motion takes seconds; CSS takes ms. */
export const dur = {
  lift: 0.12,
  drawer: 0.2,
  accent: 0.24,
  reveal: 0.5,
} as const;

/**
 * The section entrance: fade plus a 24px rise. Never travel further than this —
 * a larger distance has to move faster to finish on time, and reads as jank on
 * a mid-range phone.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: dur.reveal, ease } },
};

/**
 * Parent variant for a row or grid whose children should arrive one at a time.
 * Four badges over ~320ms reads as designed; four at once reads as a template.
 */
export const stagger = (delay = 0, gap = 0.08): Variants => ({
  hidden: {},
  show: { transition: { delayChildren: delay, staggerChildren: gap } },
});

/** For elements that should settle rather than rise — cards, image fields. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: dur.reveal, ease } },
};

/**
 * Spread onto any section wrapper. Fires once, and starts 100px before the
 * element reaches the viewport so the animation is already underway by the time
 * it is looked at.
 */
export const inView = {
  initial: 'hidden',
  whileInView: 'show',
  viewport: { once: true, margin: '-100px' },
} as const;
