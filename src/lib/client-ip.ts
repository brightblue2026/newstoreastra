/**
 * Split out of `rate-limit.ts`, which is `server-only` (it touches the
 * Upstash token) — this part is pure and has no secret, so it can be unit
 * tested directly, matching `shiprocket-tracking.ts`'s split from
 * `shiprocket.ts` for the same reason.
 */

/**
 * Best-effort client IP from the headers a proxy/edge network actually sets.
 *
 * `x-real-ip` is checked first: a correctly configured reverse proxy (Nginx's
 * `proxy_set_header X-Real-IP $remote_addr;`) *overwrites* it with what the
 * proxy itself observed, so a client-supplied value cannot survive. Only if
 * that header is absent does this fall back to `x-forwarded-for` — and takes
 * the *last* entry, not the first: standard proxy behaviour is to *append*
 * the observed peer (`proxy_set_header X-Forwarded-For
 * $proxy_add_x_forwarded_for;`), so the leftmost entry is whatever the
 * original request already claimed and the rightmost is the hop closest to
 * this server. The previous version read the leftmost entry, which is fully
 * client-controlled and made every IP-keyed rate limit (`submitOrder`, both
 * webhook routes) trivially bypassable by sending a fabricated header.
 */
export function clientIpFrom(headers: Headers): string {
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return 'unknown';
}
