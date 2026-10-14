import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEADER_BYTES } from './image-header';
vi.mock('server-only', () => ({}));
const fetcher = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', 'https://storage.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'isolated-storage-test');
  vi.stubGlobal('fetch', fetcher); fetcher.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const path = 'products/p1/00000000-0000-0000-0000-000000000001.png';
function png() {
  const data = new Uint8Array(24);
  data.set([137,80,78,71,13,10,26,10]);
  data.set([73,72,68,82],12);
  new DataView(data.buffer).setUint32(16,800);
  new DataView(data.buffer).setUint32(20,600);
  return data;
}
describe('bounded storage inspection', () => {
  it('reads dimensions and full size from a partial response', async () => {
    fetcher.mockResolvedValue(new Response(png(), { status: 206, headers: { 'content-type': 'image/png', 'content-range': 'bytes 0-23/2000000' } }));
    const { statObject } = await import('./storage');
    expect(await statObject(path)).toEqual({ bytes: 2000000, mimeType: 'image/png', dimensions: { width: 800, height: 600 } });
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetcher.mock.calls[0][1].cache).toBe('no-store');
  });
  it('cancels a whole-file response after the header without buffering the image', async () => {
    const cancelled = vi.fn();
    const header = new Uint8Array(HEADER_BYTES); header.set(png());
    fetcher.mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(header); }, cancel: cancelled }), { headers: { 'content-type': 'image/png', 'content-length': '20000000' } }));
    const { statObject } = await import('./storage');
    expect((await statObject(path))?.bytes).toBe(20000000);
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it('does not mistake a partial header for the size of an unknown large object', async () => {
    fetcher.mockResolvedValue(new Response(new Uint8Array(HEADER_BYTES), { headers: { 'content-type': 'image/png' } }));
    const { statObject } = await import('./storage');
    expect(await statObject(path)).toBeNull();
  });
  it('accepts a complete small image without content-length', async () => {
    fetcher.mockResolvedValue(new Response(png(), { headers: { 'content-type': 'image/png' } }));
    const { statObject } = await import('./storage');
    expect((await statObject(path))?.bytes).toBe(24);
  });
  it('rejects missing files and files outside the owned folder', async () => {
    fetcher.mockResolvedValue(new Response(null, { status: 404 }));
    const { statObject } = await import('./storage');
    expect(await statObject(path)).toBeNull();
    expect(await statObject('private/file')).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
