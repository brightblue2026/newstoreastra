import type { Metadata } from 'next';
import { requireAdminAccess } from '@/lib/session';
import { ROLE_LABELS, canSeePricing } from '@/lib/roles';

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

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-(--container-page) items-center justify-between gap-4 px-6 py-4">
          <span className="type-heading text-paper">Bright Blue admin</span>
          <span className="type-caption text-paper/70">
            {user.name ?? user.email} · {ROLE_LABELS[user.role]}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-(--container-page) px-6 py-12">
        {children}
        {!canSeePricing(user.role) && (
          <p className="mt-12 border-t border-line pt-6 type-body text-ink-soft">
            Your role covers orders and fulfilment. Prices, products and discounts are
            managed by a manager.
          </p>
        )}
      </main>
    </div>
  );
}
