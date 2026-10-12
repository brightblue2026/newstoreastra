import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRazorpayOrder } from './razorpay';
const fetcher = vi.fn();
beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'rzp_test_local'); vi.stubEnv('RAZORPAY_KEY_SECRET', 'local'); vi.stubGlobal('fetch', fetcher); fetcher.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const valid = { id: 'order_test1', amount: 12900, currency: 'INR', status: 'created' };
describe('Razorpay order creation contract', () => {
  it('sends server paise unchanged and sets a network deadline', async () => {
    fetcher.mockResolvedValue(Response.json(valid));
    const result = await createRazorpayOrder({ amountPaise: 12900, receipt: 'BB-2627-00001' });
    expect(result.amountPaise).toBe(12900);
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).amount).toBe(12900);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([{ currency: 'USD' }, { amount: 12800 }, { id: '' }, { status: 'paid' }])('rejects mismatched provider response %j', async (override) => {
    fetcher.mockResolvedValue(Response.json({ ...valid, ...override }));
    await expect(createRazorpayOrder({ amountPaise: 12900, receipt: 'test' })).rejects.toThrow();
  });
  it.each([0, -100, 1.5, Number.MAX_SAFE_INTEGER + 1])('never sends invalid amount %s', async (amountPaise) => {
    await expect(createRazorpayOrder({ amountPaise, receipt: 'test' })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('reports a network failure without returning a payable order', async () => {
    fetcher.mockRejectedValue(new Error('timeout'));
    await expect(createRazorpayOrder({ amountPaise: 12900, receipt: 'test' })).rejects.toThrow('Could not reach Razorpay');
  });
});
