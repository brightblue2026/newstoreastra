import { describe, expect, it } from 'vitest';
import { clientIpFrom } from './client-ip';

describe('clientIpFrom', () => {
  it('takes the first address from a comma-separated x-forwarded-for chain', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' });
    expect(clientIpFrom(headers)).toBe('203.0.113.5');
  });

  it('trims whitespace around the first address', () => {
    const headers = new Headers({ 'x-forwarded-for': '  203.0.113.5  , 10.0.0.1' });
    expect(clientIpFrom(headers)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.9' });
    expect(clientIpFrom(headers)).toBe('198.51.100.9');
  });

  it('falls back to "unknown" rather than throwing when neither header is set', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});
