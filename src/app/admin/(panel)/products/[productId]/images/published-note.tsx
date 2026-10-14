/*
  On a published product's photo pages: says plainly that changes here reach
  the store at once, with a way to look. Editing photos after publishing is
  normal, and nothing has to be unpublished first.
*/
export function PublishedNote({ isActive, slug }: { isActive: boolean; slug: string }) {
  if (!isActive) return null;
  return (
    <p className="mt-4 max-w-2xl rounded-control border border-success px-4 py-3 type-body text-ink">
      This product is on the store. Photo changes here show there straight away; there is no need
      to unpublish first.{' '}
      <a href={`/products/${slug}`} target="_blank" rel="noreferrer" className="text-signal underline">
        View on store
      </a>
    </p>
  );
}
