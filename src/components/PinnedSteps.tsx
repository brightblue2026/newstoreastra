'use client';

import { useRef } from 'react';
import Image from 'next/image';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react';

/*
  The pinned sequence. The visual column sticks for the length of the section
  while the captions scroll past it, each image cross-fading as its caption
  reaches the middle of the screen.

  Each step's `useTransform` calls live in `PinnedVisual` rather than in a
  `.map()` inside the parent. Hooks in a loop happen to work while the array
  length is stable, but it is a rules-of-hooks violation that lint will reject
  and that breaks the moment the array becomes dynamic.
*/

export type Step = {
  img: string;
  alt: string;
  title: string;
  body: string;
};

function PinnedVisual({
  step,
  index,
  count,
  progress,
  reduced,
}: {
  step: Step;
  index: number;
  count: number;
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  const seg = 1 / count;
  const opacity = useTransform(
    progress,
    [
      index * seg - 0.08,
      index * seg + 0.06,
      (index + 1) * seg - 0.06,
      (index + 1) * seg + 0.08,
    ],
    [0, 1, 1, 0],
  );
  const scale = useTransform(progress, [index * seg, (index + 1) * seg], [1.04, 0.98]);

  return (
    <motion.div
      style={reduced ? { opacity: index === 0 ? 1 : 0 } : { opacity, scale }}
      className="absolute inset-0"
    >
      <Image
        src={step.img}
        alt={step.alt}
        fill
        sizes="(max-width: 768px) 90vw, 45vw"
        className="object-contain"
      />
    </motion.div>
  );
}

export default function PinnedSteps({
  steps,
  eyebrow,
}: {
  steps: Step[];
  eyebrow?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  if (steps.length === 0) return null;

  return (
    <section
      ref={ref}
      className="relative"
      // One viewport of scroll per step. Under reduced motion the section
      // collapses to a normal-height stack — pinning 300vh of scroll onto
      // someone who asked for less motion is the opposite of the request.
      style={reduced ? undefined : { height: `${steps.length * 100}vh` }}
    >
      <div
        className={
          reduced
            ? 'mx-auto grid max-w-(--container-page) gap-12 px-6 py-24 md:grid-cols-2'
            : 'sticky top-0 mx-auto grid h-dvh max-w-(--container-page) items-center gap-12 px-6 md:grid-cols-2'
        }
      >
        <div className="relative aspect-square">
          {steps.map((step, i) => (
            <PinnedVisual
              key={step.title}
              step={step}
              index={i}
              count={steps.length}
              progress={scrollYProgress}
              reduced={Boolean(reduced)}
            />
          ))}
        </div>

        <div className={reduced ? 'space-y-12' : 'space-y-16'}>
          {eyebrow && <p className="type-caption text-ink-soft">{eyebrow}</p>}
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={reduced ? false : { opacity: 0.25 }}
              whileInView={reduced ? undefined : { opacity: 1 }}
              viewport={{ margin: '-45% 0px -45% 0px' }}
            >
              <span className="type-caption text-signal">
                Step {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 type-display-sm">{step.title}</h3>
              <p className="mt-2 max-w-sm type-body text-ink-soft">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
