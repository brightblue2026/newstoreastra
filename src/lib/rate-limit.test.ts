import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const check = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@upstash/redis', () => ({ Redis: class {} }));
vi.mock('@upstash/ratelimit', () => ({ Ratelimit: class { static slidingWindow() { return {}; } limit = check; } }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', ''); });
afterEach(() => vi.unstubAllEnvs());
describe('production abuse-protection failure policy', () => {
  it('blocks login when shared limiting is missing', async () => {
    const { checkRateLimit } = await import('./rate-limit');
    expect((await checkRateLimit('staff-login', 'account', 5, 60)).allowed).toBe(false);
  });
  it('keeps signature-verified webhook processing available', async () => {
    const { checkRateLimit } = await import('./rate-limit');
    expect((await checkRateLimit('webhook-razorpay', 'ip', 60, 60)).allowed).toBe(true);
  });
  it('allows isolated development without Redis', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { checkRateLimit } = await import('./rate-limit');
    expect((await checkRateLimit('staff-login', 'account', 5, 60)).allowed).toBe(true);
  });
  it.each(['error', 'timeout'])('blocks checkout on a Redis %s', async (mode) => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
    if (mode === 'error') check.mockRejectedValue(new Error('offline'));
    else check.mockResolvedValue({ success: true, reason: 'timeout', reset: Date.now() });
    const { checkRateLimit } = await import('./rate-limit');
    expect((await checkRateLimit('submit-order', 'ip', 10, 60)).allowed).toBe(false);
  });
});
