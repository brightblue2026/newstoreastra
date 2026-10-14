import Link from '@/components/Link';

/**
 * The last-resort 404, for a URL that matches no route at all.
 *
 * A route group carries no path segment, so an address like `/nonsense` never
 * enters `(storefront)` and never reaches its `not-found.tsx`. Without this
 * file those visitors got Next's built-in black-on-white "404: This page could
 * not be found" — no branding, no navigation, no way back into the site.
 *
 * It renders under the root layout, which has no header or footer, so it
 * carries its own way out rather than relying on chrome that isn't there. Kept
 * free of database reads for the same reason: whatever is broken enough to land
 * someone here should never make this page fail too.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-24">
      <p className="type-caption text-ink-soft">404</p>
      <h1 className="mt-6 type-display-sm">This page doesn&apos;t exist</h1>
      <p className="mt-6 type-body-lg text-ink-soft">
        The address may be mistyped or the page may have moved. Bright Blue Trading
        Corporation makes eight brands across cleaning, personal care, food and fragrance —
        all of them are on the site.
      </p>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/"
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-paper"
        >
          Go to the homepage
        </Link>
        <Link
          href="/shop"
          className="rounded-control border border-line px-6 py-3 type-body font-medium"
        >
          Browse the catalogue
        </Link>
      </div>
    </main>
  );
}
