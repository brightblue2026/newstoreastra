/**
 * Split out of `rate-limit.ts`, which is `server-only` (it touches the
 * Upstash token) — this part is pure and has no secret, so it can be unit
 * tested directly, matching `shiprocket-tracking.ts`'s split from
 * `shiprocket.ts` for the same reason.
 */

/** Best-effort client IP from the headers a proxy/edge network actually sets. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
