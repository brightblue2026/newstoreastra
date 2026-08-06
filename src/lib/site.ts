/**
 * The canonical origin.
 *
 * Canonical tags, the sitemap and JSON-LD all need absolute URLs, and all
 * three must agree — a canonical pointing at one origin while the sitemap
 * lists another is worse for indexing than having neither. `NEXT_PUBLIC_SITE_URL`
 * is the single source; the localhost fallback keeps `next build` working
 * before the production domain is configured.
 */

const configured = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** No trailing slash, so `${SITE_URL}${path}` never doubles it. */
export const SITE_URL = configured.replace(/\/+$/, '');

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
