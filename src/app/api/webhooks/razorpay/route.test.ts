import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), updateMany: vi.fn(), transition: vi.fn(), after: vi.fn(), limit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { order: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } } }));
vi.mock('@/lib/orders', () => ({ transitionOrder: mocks.transition }));
vi.mock('@/lib/notifications', () => ({ notifyOrderEvent: vi.fn() }));
vi.mock('@/lib/shiprocket-fulfilment', () => ({ autoPushOrder: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.limit, clientIpFrom: () => '127.0.0.1' }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: mocks.after }));
import { POST } from './route';

const secret = 'isolated-webhook-test-secret';
const pending = { id: 'local1', orderNumber: 'BB-2627-00001', totalPaise: 12900, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', notes: null };
function payload(event = 'payment.captured', overrides: Record<string, unknown> = {}) {
  return { event, payload: { payment: { entity: { id: 'pay_test1', order_id: 'order_test1', amount: 12900, currency: 'INR', status: 'captured', ...overrides } } } };
}
function request(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  return new Request('http://localhost/api/webhooks/razorpay', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': signature ?? createHmac('sha256', secret).update(raw).digest('hex') } });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', secret);
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.findFirst.mockResolvedValue(pending);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transition.mockResolvedValue({ ok: true, changed: true });
});
describe('Razorpay HTTP boundary (isolated database/provider doubles)', () => {
  it('rejects forged signatures before querying orders', async () => {
    expect((await POST(request(payload(), '0'.repeat(64)))).status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it('fails closed without a webhook secret', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '');
    expect((await POST(request(payload()))).status).toBe(400);
  });
  it.each(['amount', 'currency', 'status', 'id', 'order_id'])('rejects captured payments missing %s', async (field) => {
    expect((await POST(request(payload('payment.captured', { [field]: undefined })))).status).toBe(400);
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it.each([{ amount: -100 }, { amount: 100.5 }, { currency: 'USD' }, { status: 'authorized' }])('rejects invalid captured payment %j', async (override) => {
    expect((await POST(request(payload('payment.captured', override)))).status).toBe(400);
  });
  it('does not confirm an amount that differs from the local total', async () => {
    await POST(request(payload('payment.captured', { amount: 100 })));
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('looks up the exact provider order and prepaid method', async () => {
    await POST(request(payload()));
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ razorpayOrderId: 'order_test1', paymentMethod: 'RAZORPAY' });
  });
  it('confirms and schedules side effects only after a successful transition', async () => {
    expect((await POST(request(payload()))).status).toBe(200);
    expect(mocks.transition).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: 'PAID', razorpayPaymentId: 'pay_test1', actor: 'WEBHOOK' }));
    expect(mocks.after).toHaveBeenCalledTimes(2);
  });
  it('acknowledges replay without dispatching again', async () => {
    mocks.findFirst.mockResolvedValue({ ...pending, status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect((await POST(request(payload()))).status).toBe(200);
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('does not dispatch twice when another webhook wins the transaction lock', async () => {
    mocks.transition.mockResolvedValue({ ok: true, changed: false });
    await POST(request(payload()));
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('uses a conditional write so a late failure cannot overwrite paid state', async () => {
    await POST(request(payload('payment.failed', { status: 'failed' })));
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'local1', status: 'PENDING_PAYMENT', paymentStatus: { not: 'PAID' } } }));
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('records late captured payments without fulfilling a cancelled order', async () => {
    mocks.findFirst.mockResolvedValue({ ...pending, status: 'CANCELLED' });
    await POST(request(payload()));
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID' }) }));
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('asks for retry when the local order is not yet visible', async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await POST(request(payload()))).status).toBe(503);
  });
  it('asks for retry on a database transition failure', async () => {
    mocks.transition.mockResolvedValue({ ok: false, error: 'temporary conflict' });
    expect((await POST(request(payload()))).status).toBe(500);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('ignores authorization events without confirming them', async () => {
    await POST(request(payload('payment.authorized', { status: 'authorized' })));
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it('bounds payload size before parsing', async () => {
    expect((await POST(request({ data: 'x'.repeat(300_000) }))).status).toBe(413);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it('rejects excess request volume', async () => {
    mocks.limit.mockResolvedValue({ allowed: false });
    expect((await POST(request(payload()))).status).toBe(429);
  });
});
