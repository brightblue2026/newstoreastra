import { afterEach, expect, it, vi } from 'vitest';
import { logServerFailure } from './security-log';
afterEach(() => vi.restoreAllMocks());
it('does not log exception messages, stacks or attached customer/provider data', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(new Error('secret-password customer@example.com'), { token: 'private-key', query: 'private-address' });
  logServerFailure('checkout.place', error);
  expect(log).toHaveBeenCalledWith('[server-failure]', { event: 'checkout.place', kind: 'InternalError' });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-password|customer@example|private-key|private-address/);
});
it('does not inspect arbitrary thrown objects', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  logServerFailure('payment.webhook', { message: 'secret', name: 'secret' });
  expect(log).toHaveBeenCalledWith('[server-failure]', { event: 'payment.webhook', kind: 'InternalError' });
});
