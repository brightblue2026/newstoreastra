import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), transition: vi.fn(), after: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { order: { findFirst: mocks.find, updateMany: mocks.update } } }));
vi.mock('@/lib/orders', () => ({ transitionOrder: mocks.transition }));
vi.mock('@/lib/notifications', () => ({ notifyOrderEvent: vi.fn() }));
vi.mock('@/lib/shiprocket', async () => await import('@/lib/shiprocket-tracking'));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }), clientIpFrom: () => '127.0.0.1' }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: mocks.after }));
import { POST } from './route';
const order = { id: 'one', orderNumber: 'BB-2627-00001', status: 'PACKED', awbNumber: 'AWB1' };
function request(body: string, token = 'test-secret') {
  return new Request('http://localhost/api/webhooks/shiprocket', { method: 'POST', headers: { 'x-api-key': token }, body });
}
const event = (extra = {}) => JSON.stringify({ current_status: 'SHIPPED', awb: 'AWB1', order_id: order.orderNumber, ...extra });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('SHIPROCKET_WEBHOOK_TOKEN', 'test-secret');
  mocks.find.mockResolvedValue(order);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.transition.mockResolvedValue({ ok: true, changed: true });
});
afterEach(() => vi.unstubAllEnvs());
describe('courier security boundary', () => {
  it('rejects wrong credentials without accessing orders', async () => {
    expect((await POST(request(event(), 'wrong'))).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies without querying the database', async () => {
    expect((await POST(request('x'.repeat(256 * 1024 + 1)))).status).toBe(413);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON', async () => { expect((await POST(request('{'))).status).toBe(400); });
  it('rejects a payload naming two different orders', async () => {
    expect((await POST(request(event({ order_id: 'BB-2627-99999' })))).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('does not replace an existing AWB through order-number fallback', async () => {
    mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce(order);
    expect((await POST(request(event({ awb: 'OTHER' })))).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not overwrite an AWB assigned by a concurrent request', async () => {
    mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...order, awbNumber: null });
    mocks.update.mockResolvedValue({ count: 0 });
    expect((await POST(request(event()))).status).toBe(409);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: order.id, awbNumber: null } }));
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('accepts matching identifiers and schedules a changed transition', async () => {
    expect((await POST(request(event()))).status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { awbNumber: 'AWB1' } }));
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate notification when another request won the transition', async () => {
    mocks.transition.mockResolvedValue({ ok: true, changed: false });
    expect((await POST(request(event()))).status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
