import Link from '@/components/Link';

/**
 * The shared body of every storefront "not found" screen.
 *
 * Kept synchronous and database-free on purpose: whatever went wrong to land
 * someone here must not be able to make this page fail too.
 */
export default function NotFoundView({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-24">
      <p className="type-caption text-ink-soft">404</p>
      <h1 className="mt-6 type-display-sm">{heading}</h1>
      <p className="mt-6 max-w-xl type-body-lg text-ink-soft">{body}</p>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/shop"
          className="btn btn-primary"
        >
          Browse the catalogue
        </Link>
        <Link
          href="/search"
          className="btn btn-secondary"
        >
          Search by name
        </Link>
        <Link
          href="/"
          className="btn btn-secondary"
        >
          Go to the homepage
        </Link>
      </div>

      <p className="mt-16 border-t border-line pt-10 type-caption text-ink-soft">
        Every brand is listed in the footer below.
      </p>
    </div>
  );
}
