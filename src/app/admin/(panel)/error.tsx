'use client';

import Link from '@/components/Link';

/**
 * Catches anything unexpected thrown inside the admin panel. Next redacts a
 * thrown error's message in a production build (replaced with an opaque
 * digest, logged server-side but not shown to the client) — so this cannot
 * show *what* went wrong, only that something did. Known, specific failures
 * (the publish guard, for one) are handled by redirecting with a reason
 * instead of throwing, precisely so they don't end up here with no message
 * at all; this is the net under everything that isn't one of those.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24">
      <p className="type-caption text-ink-soft">Error</p>
      <h1 className="mt-6 type-display-sm">Something went wrong</h1>
      <p className="mt-6 type-body-lg text-ink-soft">
        That action didn&apos;t complete. Nothing was changed if it failed partway through — try
        again, and if it keeps happening, note what you were doing.
        {error.digest && (
          <>
            {' '}
            Reference: <span className="type-mono">{error.digest}</span>
          </>
        )}
      </p>
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-control border border-line px-6 py-3 type-body font-medium"
        >
          Back to admin
        </Link>
      </div>
    </main>
  );
}
