'use client';

import Link from '@/components/Link';

/**
 * Catches anything unexpected thrown while rendering a storefront page —
 * most plausibly a database read that failed mid-request.
 *
 * The storefront had no error boundary at all, so any such failure fell
 * through to Next's built-in error screen: unbranded, and offering the visitor
 * nothing but a dead end.
 *
 * As in the admin boundary, Next redacts a thrown error's message in a
 * production build and replaces it with an opaque digest, so this can say that
 * something went wrong but never what. The digest is surfaced anyway — it is
 * the one thing that ties a customer's report to the server log.
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-24">
      <p className="type-caption text-ink-soft">Error</p>
      <h1 className="mt-6 type-display-sm">Something went wrong</h1>
      <p className="mt-6 max-w-xl type-body-lg text-ink-soft">
        This page didn&apos;t load. It is usually temporary — try again, and if it keeps
        happening the rest of the site should still work normally.
        {error.digest && (
          <>
            {' '}
            Reference: <span className="type-mono">{error.digest}</span>
          </>
        )}
      </p>

      <div className="mt-10 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={reset}
          className="btn btn-primary"
        >
          Try again
        </button>
        <Link
          href="/shop"
          className="btn btn-secondary"
        >
          Browse the catalogue
        </Link>
      </div>
    </div>
  );
}
