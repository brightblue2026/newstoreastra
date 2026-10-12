import { describe, expect, it } from 'vitest';
import { readBoundedBody, RequestBodyTooLarge } from './request-body';
describe('bounded webhook bodies', () => {
  it('preserves signed whitespace and unicode exactly', async () => {
    const body = ' { "name": "കേരളം" }\n';
    expect(await readBoundedBody(new Request('http://local', { method: 'POST', body }))).toBe(body);
  });
  it('rejects an oversized declaration', async () => {
    await expect(readBoundedBody(new Request('http://local', { method: 'POST', body: 'x', headers: { 'content-length': '99' } }), 10)).rejects.toBeInstanceOf(RequestBodyTooLarge);
  });
  it('counts bytes even when content-length is absent', async () => {
    await expect(readBoundedBody(new Request('http://local', { method: 'POST', body: '€€' }), 5)).rejects.toBeInstanceOf(RequestBodyTooLarge);
  });
});
