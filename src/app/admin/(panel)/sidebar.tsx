'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isCurrent, type NavGroup } from './nav';

/**
 * The admin sidebar: a fixed rail from 1024px, a drawer below it.
 *
 * A client component only because it needs the current path to mark the
 * active link, and an open/closed state on small screens. The link list
 * itself is computed on the server in `nav.ts` from the signed-in role.
 */
export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Navigating is what closes the drawer — without this it stays open over the
  // page the user just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes it, like every other dismissible layer in the panel.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {/* Below 1024px the rail is replaced by this toggle. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="admin-nav"
        className="mb-2 self-start rounded-control border border-line px-4 py-2 type-caption lg:hidden"
      >
        Menu
      </button>


      <nav
        id="admin-nav"
        aria-label="Admin sections"
        className={`${
          open ? 'mb-4 w-full rounded-card border bg-white p-6' : 'hidden'
        } border-line lg:sticky lg:top-0 lg:z-auto lg:block lg:h-dvh lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:bg-transparent lg:p-0 lg:pt-12`}
      >
        {open && (
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <span className="type-caption text-ink-soft">Sections</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-control border border-line px-4 py-2 type-caption"
            >
              Close
            </button>
          </div>
        )}

        <div className="flex flex-col gap-8 lg:pr-6">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="type-caption text-ink-soft">{group.title}</p>
              <ul className="mt-3 flex flex-col gap-1">
                {group.items.map((item) => {
                  const current = isCurrent(item.href, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={current ? 'page' : undefined}
                        className={`block rounded-control px-3 py-2 type-body ${
                          current ? 'bg-ink text-paper shadow-bb' : 'text-ink hover:bg-line/40'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
