import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { clientIpFrom } from './client-ip';

export { clientIpFrom };

/**
 * Rate limiting over Upstash Redis — REST-based, so it works from any
 * serverless runtime without a persistent connection.
 *
 * Built the same way Shiprocket, MSG91 and Resend were: against
 * documented behaviour, ahead of real credentials, gated by `isConfigured()`
 * so an unconfigured deployment degrades to "not limited" rather than
 * throwing. That degrade direction is deliberate here too, not just
 * convenient — this store already has one documented case (staff login) where
 * "no shared store" was treated as "cannot limit yet", not "reject every
 * request"; unconfigured must fail the same way everywhere this is used, or
 * checkout breaks the moment this file is added, before anyone has set up
 * Upstash. Configure it before relying on it for anything that actually needs
 * throttling.
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
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

export interface RateLimitResult {
  /** Always true when Upstash is not configured — see the module comment. */
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
  if (!isRateLimitConfigured()) {
    console.warn(`[rate-limit] "${name}" not enforced — UPSTASH_REDIS_REST_URL/TOKEN unset.`);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  try {
    const result = await limiterFor(name, requests, windowSeconds).limit(key);
    return {
      allowed: result.success,
      retryAfterSeconds: result.success ? 0 : Math.ceil((result.reset - Date.now()) / 1000),
    };
  } catch (error) {
    // Upstash being unreachable must not be able to take down login or
    // checkout — same "a third party going down never blocks a sale"
    // principle §10 already applies to Razorpay/Shiprocket.
    console.error(`[rate-limit] "${name}" check failed, allowing the request:`, error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
