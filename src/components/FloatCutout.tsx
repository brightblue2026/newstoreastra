'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

/*
  Two nested layers, each owning its own `y` so they compose without fighting:

    outer — scroll parallax, tied to the element's progress through the viewport
    inner — a slow idle drift, so a flat PNG doesn't sit dead on the page

  Give sibling cutouts different `depth` and `delay` values. Identical values
  make them move as one sheet, which is the exact thing this is meant to avoid.
*/
export default function FloatCutout({
  src,
  alt,
  width = 640,
  height = 640,
  depth = 60,
  delay = 0,
  priority = false,
  sizes = '(max-width: 768px) 80vw, 40vw',
  className = '',
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** px of parallax travel in each direction. */
  depth?: number;
  /** Seconds of offset on the idle drift, to desync from neighbours. */
  delay?: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [depth, -depth]);

  return (
    <motion.div ref={ref} style={reduced ? undefined : { y }} className={className}>
      <motion.div
        animate={reduced ? undefined : { y: [0, -12, 0] }}
        transition={
          reduced
            ? undefined
            : { duration: 6, delay, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          priority={priority}
          className="h-auto w-full drop-shadow-[0_24px_48px_rgb(11_31_58_/_0.18)]"
        />
      </motion.div>
    </motion.div>
  );
}
