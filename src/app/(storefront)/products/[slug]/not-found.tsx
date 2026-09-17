import NotFoundView from '@/components/NotFoundView';

/**
 * Rendered when `page.tsx` calls `notFound()` for a slug with no product —
 * and, unlike returning this body from the page, it carries a real 404.
 */
export default function ProductNotFound() {
  return (
    <NotFoundView
      heading="We couldn't find that product"
      body="The link may be out of date, or the product may no longer be listed. Everything we make is still here — start from the catalogue, or search for it by name."
    />
  );
}
