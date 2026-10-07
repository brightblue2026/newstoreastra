'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_IMAGE_MIME_TYPES,
  MIN_LONG_EDGE_PX,
  PHOTOGRAPHY_CHECKLIST,
} from '@/lib/storage-shared';
import { saveProductImageAction, signProductImageUploadAction } from './actions';

/*
  The upload itself never touches this app's server: the browser asks for a
  short-lived signed URL, PUTs the file straight to Supabase Storage, and only
  the *path* comes back here to be written into `ProductImage`. That keeps a
  multi-megabyte product photo off the Next.js server entirely.

  The long-edge and format checks run twice — once here, against the file the
  browser can already see, so a bad upload is never even attempted; once more
  in `saveProductImageAction`, which re-reads them from the stored object
  rather than believing anything sent from here.
*/

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(',');

/**
 * Reads pixel dimensions straight from the file. Deliberately not
 * `URL.createObjectURL` + `<img>` — that path loads the blob as a page
 * resource, which the CSP's `img-src` (self, data:, the storage host) then
 * blocks, since a `blob:` URL matches none of those. `createImageBitmap`
 * decodes the file in memory without going through the resource-fetch
 * pipeline at all, so it isn't subject to `img-src`.
 */
async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    throw new Error('Could not read that file as an image.');
  }
}

/**
 * A `data:` URL, not a `blob:` one, for the same CSP reason as
 * `readImageDimensions` above — `img-src` allows `data:` already, so this
 * needs no CSP change to render a preview before anything is uploaded.
 */
function readPreviewDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not preview that file.'));
    reader.readAsDataURL(file);
  });
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
): Promise<{ ok: boolean; status: number; body: string }> {
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
    xhr.onload = () =>
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error('Network error while uploading the photo.'));
    xhr.send(file);
  });
}

export function ImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function handleFileChange() {
    setError(null);
    setSuccess(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    try {
      setPreview(await readPreviewDataUrl(file));
    } catch {
      setPreview(null);
    }
  }

  async function handleUpload() {
    setError(null);
    setSuccess(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    if (!alt.trim()) {
      setError('Alt text is required.');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const format = file.type.split('/')[1]?.toLowerCase() ?? '';
      if (!(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(format === 'jpg' ? 'jpeg' : format)) {
        setError('Unsupported format — use PNG, JPEG, WebP or AVIF.');
        return;
      }

      const { width, height } = await readImageDimensions(file);
      if (Math.max(width, height) < MIN_LONG_EDGE_PX) {
        setError(`Image must be at least ${MIN_LONG_EDGE_PX}px on the long edge (this one is ${Math.max(width, height)}px).`);
        return;
      }

      const signResult = await signProductImageUploadAction(productId, file.type);
      if (!signResult.ok) {
        setError(signResult.error);
        return;
      }
      const { uploadUrl, path, maxFileSize } = signResult.ticket;

      // A courtesy check. The bucket enforces its own size limit, and
      // `saveProductImageAction` re-reads the stored object's real size before
      // writing a row, so this only saves the user a pointless upload.
      if (file.size > maxFileSize) {
        setError(`File is too large — must be under ${Math.round(maxFileSize / (1024 * 1024))}MB.`);
        return;
      }

      const uploadResult = await uploadWithProgress(uploadUrl, file, setProgress);
      if (!uploadResult.ok) {
        setError(
          uploadResult.status === 409
            ? 'That photo was already uploaded. Refresh and check the list below.'
            : 'The photo could not be uploaded. Try again.',
        );
        return;
      }

      // Only the path and the alt text. Everything else about the file is read
      // back from storage by the server — it does not take this page's word
      // for the size, the format or the dimensions.
      const saveResult = await saveProductImageAction(productId, { path, alt: alt.trim() });
      if (!saveResult.ok) {
        setError(saveResult.error ?? 'Could not save that image.');
        return;
      }

      setSuccess(`"${alt.trim()}" uploaded.`);
      setAlt('');
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Something went wrong reading or uploading that file.');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="mt-8 max-w-xl rounded-card border border-line p-6">
      <p className="type-caption text-ink-soft">Before uploading</p>
      <ul className="mt-2 list-inside list-disc type-body text-ink-soft">
        {PHOTOGRAPHY_CHECKLIST.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <label htmlFor="imageAlt" className="mt-6 block type-caption text-ink-soft">
        Alt text
      </label>
      <input
        id="imageAlt"
        value={alt}
        onChange={(event) => setAlt(event.target.value)}
        placeholder="MX Three Dish Wash Liquid, Lemon, 450 ml"
        className="mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body"
      />

      <label htmlFor="imageFile" className="mt-6 block type-caption text-ink-soft">
        File
      </label>
      <input
        id="imageFile"
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileChange}
        className="mt-2 w-full type-body"
      />

      {preview && (
        // A local data: preview of a file that has not been uploaded
        // anywhere yet — next/image needs a real, hostable src, and it
        // optimises this properly once it is uploaded and rendered as a real
        // ProductImage instead.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Preview of the file chosen above, before upload"
          className="mt-4 aspect-square w-32 rounded-control border border-line object-cover"
        />
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-control border border-warning px-4 py-3 type-body text-warning">
          {error}
        </p>
      )}

      {success && !uploading && (
        <p role="status" className="mt-4 rounded-control border border-success px-4 py-3 type-body text-success">
          {success}
        </p>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading}
        className="mt-6 rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
      >
        {uploading ? (progress !== null ? `Uploading… ${progress}%` : 'Uploading…') : 'Upload'}
      </button>

      {uploading && (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress ?? 0}
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line"
        >
          <div
            className="motion-lift h-full bg-signal"
            style={{ width: `${progress ?? 0}%` }}
          />
        </div>
      )}
    </div>
  );
}
