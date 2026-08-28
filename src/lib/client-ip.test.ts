import { describe, expect, it } from 'vitest';
import { clientIpFrom } from './client-ip';

describe('clientIpFrom', () => {
  it('prefers x-real-ip over x-forwarded-for', () => {
    // A correctly configured reverse proxy overwrites x-real-ip with what it
    // observed, so it's trusted first even when x-forwarded-for is present.
    const headers = new Headers({
      'x-real-ip': '198.51.100.9',
      'x-forwarded-for': '203.0.113.5, 198.51.100.9',
    });
    expect(clientIpFrom(headers)).toBe('198.51.100.9');
  });

  it('trims whitespace around x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '  198.51.100.9  ' });
    expect(clientIpFrom(headers)).toBe('198.51.100.9');
  });

  it('falls back to the LAST hop of x-forwarded-for, not the first', () => {
    // The leftmost entry is whatever the original request claimed — fully
    // client-controlled. The rightmost is the hop closest to this server,
    // appended by the proxy itself under the standard
    // `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` config.
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 198.51.100.9' });
    expect(clientIpFrom(headers)).toBe('198.51.100.9');
  });

  it('trims whitespace around the last x-forwarded-for hop', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5,   198.51.100.9  ' });
    expect(clientIpFrom(headers)).toBe('198.51.100.9');
  });

  it('a fabricated x-forwarded-for cannot evade the limit on its own', () => {
    // Simulates the exploit: an attacker sends a fresh, made-up leftmost
    // entry on every request, but the trusted proxy's own appended hop
    // (rightmost) stays the same real IP every time.
    const attempt1 = new Headers({ 'x-forwarded-for': '1.1.1.1, 198.51.100.9' });
    const attempt2 = new Headers({ 'x-forwarded-for': '2.2.2.2, 198.51.100.9' });
    expect(clientIpFrom(attempt1)).toBe(clientIpFrom(attempt2));
  });

  it('falls back to "unknown" rather than throwing when neither header is set', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});
