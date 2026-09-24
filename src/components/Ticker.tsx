'use client';

import { m, useReducedMotion } from 'motion/react';

/*
  The announcement bar. Content is duplicated once and the row translates by
  exactly -50%, so the second copy lands where the first began and the loop is
  seamless. Duplicating fewer or more times breaks that arithmetic.
*/
export default function Ticker({ items }: { items: string[] }) {
  const reduced = useReducedMotion();

  if (items.length === 0) return null;

  const row = [...items, ...items];

  return (
    <div className="overflow-hidden bg-ink py-3 text-paper">
      {reduced ? (
        // No loop under reduced motion. A single static pass still carries the
        // message, which is the point of the bar.
        <ul className="mx-auto flex max-w-(--container-page) flex-wrap justify-center gap-x-12 gap-y-1 px-6 type-caption">
          {items.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : (
        <m.ul
          className="flex w-max gap-12"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
        >
          {row.map((text, i) => (
            <li
              key={`${text}-${i}`}
              className="whitespace-nowrap type-caption"
              // The second copy is decorative; a screen reader should hear the
              // announcements once, not twice.
              aria-hidden={i >= items.length}
            >
              {text}
            </li>
          ))}
        </m.ul>
      )}
    </div>
  );
}
