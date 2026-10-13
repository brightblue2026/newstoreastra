import { ALLOWED_IMAGE_FORMATS, MAX_UPLOAD_BYTES } from '@/lib/storage-shared';
import { saveProductImageAction, signProductImageUploadAction } from './actions';

/*
  Sending one photo, shared by the full uploader and the one-press "Add photo"
  button on the variants list.

  The file itself never touches this app's server: the browser asks for a
  short-lived signed URL, PUTs the file straight to Supabase Storage, and only
  the *path* comes back to be written into `ProductImage`.

  The two server calls around that upload are retried. The hosting cuts a
  request off now and then (a 503 from the edge, seen in production as
  "Worker exceeded CPU time limit"), and a photo that was chosen, described
  and half sent should not be lost to one of those.
*/

/** Why a file cannot be used at all, or null when it can be sent. */
export function checkPhotoFile(file: File): string | null {
  const format = file.type.split('/')[1]?.toLowerCase() ?? '';
  if (!(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(format)) {
    return 'Unsupported format — use PNG, JPEG, WebP or AVIF.';
  }
  // A courtesy check. The bucket enforces its own size limit, and
  // `saveProductImageAction` re-reads the stored object's real size before
  // writing a row, so this only saves the user a pointless upload.
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is too large — must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`;
  }
  return null;
}

/**
 * `fetch` gives no upload progress at all — the response promise only
 * resolves once the whole round trip is done — so the upload specifically
 * goes through `XMLHttpRequest` instead, purely for its `upload.onprogress`
 * event. A multi-megabyte photo over a slow uplink is the normal case here,
 * not the exception, so silence for the whole duration is a real gap, not a
 * cosmetic one.
 *
 * A signed Storage URL takes the raw file as the request body with `PUT`, not
 * a multipart form — the token is already in the URL, so there is nothing else
 * to send. The response body is not parsed: the status is the whole answer,
 * and the server re-reads the object anyway.
 */
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    // Never overwrite: the server signs a fresh, random path per upload, so a
    // collision means something is wrong rather than something to paper over.
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  });
}

const ATTEMPTS = 3;

/**
 * Runs a server call, trying again when it throws. A server action that
 * *answers* — even with a refusal — is returned as it is; only a call that
 * never got an answer is repeated. `onRetry` lets the caller know an attempt
 * was lost.
 */
async function withRetry<T>(run: () => Promise<T>, onRetry?: () => void): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      onRetry?.();
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

export type SendResult = { ok: true } | { ok: false; message: string };

const TRY_AGAIN = 'The photo could not be saved. Check the connection and try again.';

/** Signs, sends and records one photo. Never throws. */
export async function sendPhoto({
  productId,
  file,
  alt,
  variantIds,
  onProgress,
}: {
  productId: string;
  file: File;
  alt: string;
  /** Empty for a photo of the product as a whole. */
  variantIds: string[];
  onProgress: (percent: number) => void;
}): Promise<SendResult> {
  try {
    // Signing again is harmless: an unused signed URL stores nothing.
    const signResult = await withRetry(() => signProductImageUploadAction(productId, file.type));
    if (!signResult.ok) return { ok: false, message: signResult.error };
    const { uploadUrl, path } = signResult.ticket;

    const uploadResult = await uploadWithProgress(uploadUrl, file, onProgress);
    if (!uploadResult.ok) {
      return {
        ok: false,
        message:
          uploadResult.status === 409
            ? 'That photo was already uploaded. Refresh and check the saved photos.'
            : 'The photo could not be uploaded. Try again.',
      };
    }

    // Only the path, the description and the variants. Everything else about
    // the file is read back from storage by the server — it does not take
    // this page's word for the size, the format or the dimensions.
    let answerLost = false;
    const saveResult = await withRetry(
      () => saveProductImageAction(productId, { path, alt, variantIds }),
      () => {
        answerLost = true;
      },
    );
    if (saveResult.ok) return { ok: true };
    // An attempt whose answer never arrived may still have saved the photo;
    // the repeat is then told it is already there, which is the outcome wanted.
    if (answerLost && saveResult.error === 'That photo is already saved.') return { ok: true };
    return { ok: false, message: saveResult.error ?? 'Could not save that photo.' };
  } catch {
    return { ok: false, message: TRY_AGAIN };
  }
}
