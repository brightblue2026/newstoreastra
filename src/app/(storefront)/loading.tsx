/**
 * The storefront's loading state.
 *
 * Every storefront page reads the database on the server, and several of them
 * (shop, search, a brand with its whole variant list) do real work before the
 * first byte. With no `loading.tsx`, a navigation left the previous page on
 * screen with nothing acknowledging the tap — on a phone on mobile data that
 * reads as a dead link, and invites a second tap.
 *
 * A shape-matched skeleton rather than a spinner: it occupies the layout the
 * real page is about to fill, so the content does not jump when it arrives.
 * The pulse is animation-only and the global `prefers-reduced-motion` rule in
 * `globals.css` flattens it, so nothing here needs its own guard.
 */
export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-24" aria-hidden="true">
      {/* Announced once, politely, for anyone who cannot see the skeleton. */}
      <span className="sr-only" role="status" aria-live="polite">
        Loading
      </span>

      <div className="animate-pulse">
        <div className="h-3 w-24 rounded-full bg-line" />
        <div className="mt-6 h-10 w-2/3 max-w-lg rounded-control bg-line" />
        <div className="mt-4 h-4 w-1/2 max-w-md rounded-full bg-line" />

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="rounded-card border border-line p-4">
              <div className="aspect-square rounded-card bg-line" />
              <div className="mt-4 h-4 w-3/4 rounded-full bg-line" />
              <div className="mt-2 h-3 w-1/2 rounded-full bg-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
