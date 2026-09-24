'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { dur, ease } from '@/lib/motion';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/*
  The cart drawer.

  A drawer that opens over the page is a modal whether or not it is called one,
  so it behaves like one: focus moves in, Tab cycles inside it, Escape closes
  it, and focus returns to whatever opened it. The rest of the page is inert to
  assistive tech while it is open.

  Spring physics were specified for the slide, but the house budget is one
  curve and four durations — so this uses `--bb-duration-drawer` on the shared
  expo-out. The difference is imperceptible; the consistency is not.
*/
export default function CartDrawer({
  open,
  onClose,
  title = 'Your cart',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Move focus into the panel once it exists.
    const id = requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panel.current) return;

      const nodes = Array.from(
        panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Stop the page behind from scrolling under the drawer.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.drawer, ease }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-ink/35 backdrop-blur-sm"
            aria-hidden="true"
          />

          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: dur.drawer, ease }}
            className="fixed inset-y-0 right-0 z-[70] flex h-dvh w-full max-w-md flex-col bg-paper safe-x"
          >
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="type-heading">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="tap-target rounded-control px-3 py-2 type-caption text-ink-soft hover:text-ink"
              >
                Close
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Wrap each line item so removing one slides the rest up rather than snapping.
 *
 * The removed line collapses its own height as it leaves, rather than the
 * others animating with `layout`: layout projection is the one Motion feature
 * the storefront would otherwise need `domMax` for, and it is a third of the
 * library shipped to every phone for this alone. See `MotionProvider`.
 */
export function CartLine({ children }: { children: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: dur.drawer, ease }}
      className="overflow-hidden border-b border-line py-4 last:border-b-0"
    >
      {children}
    </m.div>
  );
}
