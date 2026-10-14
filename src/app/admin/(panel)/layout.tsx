import type { Metadata } from 'next';
import Link from '@/components/Link';
import { requireAdminAccess } from '@/lib/session';
import { ROLE_LABELS, canSeePricing } from '@/lib/roles';
import { navFor } from './nav';
import { Sidebar } from './sidebar';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

/** The admin panel is never cached and never statically rendered. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Layer two of three. Middleware ran first; every server action checks again.
  const user = await requireAdminAccess();
  const groups = navFor(user.role);

  return (
    <div className="min-h-screen bg-sky/25 text-ink">
      <a href="#admin-content" className="skip-link">Skip to workspace</a>
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-(--container-page) items-center justify-between gap-4 px-6 py-4">
          <Link href="/admin" className="type-heading text-paper">
            Bright Blue / workspace
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-4">
            <Link href="/" className="hidden rounded-control border border-paper/30 px-3 py-2 text-sm sm:block">View store ↗</Link>
            <span className="text-sm text-paper/80">
              {user.name ?? user.email} · {ROLE_LABELS[user.role]}
            </span>
            {/* A shared office computer is the normal case here, so leaving
                has to be one obvious press, on every page. */}
            <form action="/admin/logout" method="post">
              <button
                type="submit"
                className="type-caption text-paper underline underline-offset-4 hover:text-paper/80"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Stacked below 1024px so the drawer's toggle sits above the page, not
          beside it; a rail and a column from 1024px up. */}
      <div className="mx-auto flex max-w-(--container-page) flex-col px-6 pt-6 lg:flex-row lg:gap-10 lg:pt-0">
        <Sidebar groups={groups} />

        <main id="admin-content" tabIndex={-1} className="min-w-0 flex-1 py-8 lg:py-12">
          {children}
          {!canSeePricing(user.role) && (
            <p className="mt-12 border-t border-line pt-6 type-body text-ink-soft">
              Your role covers orders and fulfilment. Prices, products and discounts are
              managed by a manager.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
