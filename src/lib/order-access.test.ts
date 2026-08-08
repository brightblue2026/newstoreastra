import { describe, expect, it } from 'vitest';
import { isValidOrderToken, orderAccessToken, phoneMatches } from './order-access';

process.env.AUTH_SECRET ??= 'test-secret-for-order-access';

describe('orderAccessToken', () => {
  it('accepts its own token', () => {
    const token = orderAccessToken('BB-2627-00001');
    expect(isValidOrderToken('BB-2627-00001', token)).toBe(true);
  });

  it('is order-specific, so one link cannot read the next order', () => {
    // Order numbers are sequential, which is exactly why the token has to bind
    // to one of them.
    const token = orderAccessToken('BB-2627-00001');
    expect(isValidOrderToken('BB-2627-00002', token)).toBe(false);
  });

  it('is case-insensitive about the order number itself', () => {
    expect(isValidOrderToken('bb-2627-00001', orderAccessToken('BB-2627-00001'))).toBe(true);
  });

  it('rejects a missing, truncated or wrong token', () => {
    const token = orderAccessToken('BB-2627-00001');
    expect(isValidOrderToken('BB-2627-00001', null)).toBe(false);
    expect(isValidOrderToken('BB-2627-00001', '')).toBe(false);
    expect(isValidOrderToken('BB-2627-00001', token.slice(0, 10))).toBe(false);
    expect(isValidOrderToken('BB-2627-00001', 'f'.repeat(token.length))).toBe(false);
  });
});

describe('phoneMatches', () => {
  it('matches however the number was typed', () => {
    expect(phoneMatches('+91 98470 12345', '9847012345')).toBe(true);
    expect(phoneMatches('098470-12345', '9847012345')).toBe(true);
  });

  it('rejects a different number, a partial one and a missing one', () => {
    expect(phoneMatches('9847012346', '9847012345')).toBe(false);
    expect(phoneMatches('012345', '9847012345')).toBe(false);
    expect(phoneMatches('9847012345', null)).toBe(false);
  });
});
