import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sign = vi.fn();
const save = vi.fn();
vi.mock('./actions', () => ({
  signProductImageUploadAction: (...args: unknown[]) => sign(...args),
  saveProductImageAction: (...args: unknown[]) => save(...args),
}));

import { checkPhotoFile, sendPhoto } from './send-photo';

/** A stand-in for the browser's upload: answers with whatever status is set. */
let putStatus = 200;
class FakeXhr {
  status = 0;
  upload: { onprogress: ((event: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  timeout = 0;
  open() {}
  setRequestHeader() {}
  send() {
    if (putStatus === -1) { this.ontimeout?.(); return; }
    if (putStatus === -2) { this.onabort?.(); return; }
    this.status = putStatus;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 5 });
    this.onload?.();
  }
}

const file = { type: 'image/png', size: 1000 } as File;
const ticket = { ok: true, ticket: { uploadUrl: 'https://storage.test/put', path: 'products/p1/a.png' } };
const send = () =>
  sendPhoto({ productId: 'p1', file, alt: 'A photo', variantIds: ['v1'], onProgress: () => {} });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  putStatus = 200;
  sign.mockReset();
  save.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Lets the retry delays elapse while the send is in flight. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('checkPhotoFile', () => {
  it('accepts the four image formats and refuses the rest', () => {
    expect(checkPhotoFile({ type: 'image/jpeg', size: 10 } as File)).toBeNull();
    expect(checkPhotoFile({ type: 'image/avif', size: 10 } as File)).toBeNull();
    expect(checkPhotoFile({ type: 'application/pdf', size: 10 } as File)).toMatch(/Unsupported format/);
    expect(checkPhotoFile({ type: 'image/svg+xml', size: 10 } as File)).toMatch(/Unsupported format/);
  });

  it('refuses a file over the size cap', () => {
    expect(checkPhotoFile({ type: 'image/png', size: 21 * 1024 * 1024 } as File)).toMatch(/too large/);
  });
});

describe('sendPhoto', () => {
  it('signs, uploads and saves with the variants it was given', async () => {
    sign.mockResolvedValue(ticket);
    save.mockResolvedValue({ ok: true });

    expect(await settle(send())).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith('p1', { path: 'products/p1/a.png', alt: 'A photo', variantIds: ['v1'] });
  });

  it('tries again when a server call gets no answer', async () => {
    sign.mockRejectedValueOnce(new Error('503')).mockResolvedValue(ticket);
    save.mockRejectedValueOnce(new Error('503')).mockResolvedValue({ ok: true });

    expect(await settle(send())).toEqual({ ok: true });
    expect(sign).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('counts "already saved" as saved when the first answer was lost', async () => {
    sign.mockResolvedValue(ticket);
    save
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue({ ok: false, error: 'That photo is already saved.' });

    expect(await settle(send())).toEqual({ ok: true });
  });

  it('does not count "already saved" as saved when nothing was lost', async () => {
    sign.mockResolvedValue(ticket);
    save.mockResolvedValue({ ok: false, error: 'That photo is already saved.' });

    expect(await settle(send())).toEqual({ ok: false, message: 'That photo is already saved.' });
  });

  it('gives up after three attempts and says so plainly', async () => {
    sign.mockRejectedValue(new Error('503'));

    const result = await settle(send());
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/could not be saved/) });
    expect(sign).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
  });

  it('passes on a refusal from the server without retrying it', async () => {
    sign.mockResolvedValue({ ok: false, error: 'That product no longer exists.' });

    expect(await settle(send())).toEqual({ ok: false, message: 'That product no longer exists.' });
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('reports a failed upload and never saves a row for it', async () => {
    sign.mockResolvedValue(ticket);
    putStatus = 500;

    expect(await settle(send())).toEqual({ ok: false, message: expect.stringMatching(/could not be uploaded/) });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('upload failure recovery', () => {
  it.each([-1, -2])('releases the uploader after timeout or abort (%s)', async (status) => {
    sign.mockResolvedValue(ticket); putStatus = status;
    expect((await settle(send())).ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it('bounds a server action that never answers', async () => {
    sign.mockImplementation(() => new Promise(() => {}));
    expect((await settle(send())).ok).toBe(false);
    expect(sign).toHaveBeenCalledTimes(3);
  });
  it('shows signing, transfer and save as distinct stages', async () => {
    sign.mockResolvedValue(ticket); save.mockResolvedValue({ ok: true });
    const stage = vi.fn();
    await settle(sendPhoto({ productId: 'p1', file, alt: 'Photo', variantIds: [], onProgress: () => {}, onStage: stage }));
    expect(stage.mock.calls.flat()).toEqual(['Preparing upload…', 'Uploading…', 'Checking and saving…']);
  });
});
