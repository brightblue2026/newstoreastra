/**
 * Strips the order-access capability token from a URL before Sentry ever
 * sees it. Shared across all three Sentry configs (server, edge, client) so
 * the rule can't drift between them.
 *
 * The token (`?t=…` on `/order/[orderNumber]` and `/api/invoice/[orderNumber]`,
 * see `src/lib/order-access.ts`) deliberately never expires — that's the
 * point, it's a link a customer keeps. Which also means once it reaches a
 * third party it's a standing credential for that order for as long as
 * Sentry retains the event, not a one-time leak. `sendDefaultPii: false` and
 * the cookie/authorization-header stripping already in place don't cover
 * this — a capability token isn't a cookie or an auth header, it's a query
 * parameter, and Sentry captures `event.request.url` regardless of
 * `sendDefaultPii`.
 */
export function scrubCapabilityToken(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url, 'http://localhost');
    if (!parsed.searchParams.has('t')) return url;
    parsed.searchParams.set('t', 'redacted');
    // Reconstruct without the placeholder origin we only added to parse a
    // possibly-relative URL.
    return url.startsWith('http') ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
