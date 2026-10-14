import NextLink from 'next/link';
import type { ComponentProps } from 'react';

/*
  The app's link. Same as Next's, except it does not preload the page it points
  to unless asked.

  Next preloads every link that scrolls into view. On the shop page that was
  one extra request per product card, brand and policy link — about eighty
  server renders for a single visit — and on the admin's product list, several
  per row, each one signed in and reading the database. On 13 October 2026 that
  burst is what pushed the Worker over its CPU limit (Cloudflare error 1102)
  once the catalogue went from one published product to sixty-nine.

  Pass `prefetch` to bring preloading back for one link.
*/
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
