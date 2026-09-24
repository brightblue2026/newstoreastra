'use client';

import { LazyMotion, domAnimation } from 'motion/react';

/*
  Every storefront animation renders through `m.*` with the `domAnimation`
  feature set: animate, exit, variants, hover/tap/focus and in-view. What it
  leaves out is drag and layout projection, about a third of the library,
  which the storefront never needs — so none of it ships to a phone.

  The features are passed synchronously on purpose. A lazy `import()` would
  go through the same `motion/react` barrel the rest of the code imports, and
  webpack then bundles the features into the first-load chunk anyway (checked
  against the build output), deferring nothing.

  `strict` makes a stray `motion.div` throw in development instead of silently
  pulling the whole library back in.
*/
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
