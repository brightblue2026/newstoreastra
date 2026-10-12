import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { clientIpFrom } from './client-ip';

export { clientIpFrom };

/** Shared limits protect authentication, checkout and public queries.
 * Sensitive operations fail closed in production. Signed webhook endpoints
 * remain available during Redis outages: their HMAC is still mandatory.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export function isRateLimitConfigured(): boolean {
  return Boolean(url && token);
}

let redis: Redis | null = null;
function client(): Redis {
  if (!redis) redis = new Redis({ url: url!, token: token! });
  return redis;
}

const limiters = new Map<string, Ratelimit>();

/** One limiter instance per named limit, so each gets its own Redis keyspace. */
function limiterFor(name: string, requests: number, windowSeconds: number): Ratelimit {
  const cacheKey = `${name}:${requests}:${windowSeconds}`;
  const existing = limiters.get(cacheKey);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: client(),
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    prefix: `bbtc-ratelimit:${name}`,
    timeout: 2000,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

export interface RateLimitResult {
  /** Whether this request may proceed. */
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Checks and consumes one request against a named, sliding-window limit.
 *
 * `key` is whatever the limit is actually per — an email for login attempts,
 * an IP for a webhook or an anonymous checkout. Callers decide that; this
 * function only enforces the count once a key is chosen.
 */
export async function checkRateLimit(
  name: string,
  key: string,
  requests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const fallback = {
    allowed: process.env.NODE_ENV !== 'production' || name.startsWith('webhook-'),
    retryAfterSeconds: 60,
  };
  if (!isRateLimitConfigured()) {
    console.warn(`[rate-limit] "${name}" unavailable — UPSTASH_REDIS_REST_URL/TOKEN unset.`);
    return fallback;
  }

  try {
    const result = await limiterFor(name, requests, windowSeconds).limit(key);
    if (result.reason === 'timeout') return fallback;
    return {
      allowed: result.success,
      retryAfterSeconds: result.success ? 0 : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  } catch (error) {
    // Log no key, email, token or provider response.
    console.error(`[rate-limit] "${name}" unavailable (${error instanceof Error ? error.name : 'unknown'}).`);
    return fallback;
  }
}
