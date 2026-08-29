'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALLOWED_IMAGE_FORMATS, MIN_LONG_EDGE_PX, PHOTOGRAPHY_CHECKLIST } from '@/lib/cloudinary-shared';
import { saveProductImageAction, signProductImageUploadAction } from './actions';

/*
  The upload itself never touches this app's server: the browser asks for a
  signature, then POSTs the file straight to Cloudinary with it, and only the
  *result* (a public id and a URL) comes back here to be written into
  `ProductImage`. That keeps a multi-megabyte product photo off the Next.js
  server entirely.

  The long-edge and format checks run twice — once here, against the file the
  browser can already see, so a bad upload is never even attempted; once more
  in `saveProductImageAction`, because a client check is only ever a courtesy.
*/

const ACCEPT = ALLOWED_IMAGE_FORMATS.map((format) => `image/${format === 'jpg' ? 'jpeg' : format}`).join(',');

/**
 * Reads pixel dimensions straight from the file. Deliberately not
 * `URL.createObjectURL` + `<img>` — that path loads the blob as a page
 * resource, which the CSP's `img-src` (self, data:, res.cloudinary.com) then
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
 * resolves once the whole round trip is done — so the Cloudinary POST
 * specifically goes through `XMLHttpRequest` instead, purely for its
 * `upload.onprogress` event. A multi-megabyte photo over a slow uplink is
 * the normal case here, not the exception, so silence for the whole
 * duration is a real gap, not a cosmetic one.
 */
function uploadWithProgress(
  url: string,
  body: FormData,
  onProgress: (percent: number) => void,
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      try {
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, json: JSON.parse(xhr.responseText) });
      } catch {
        reject(new Error('Cloudinary returned an unexpected response.'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading to Cloudinary.'));
    xhr.send(body);
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

      const signResult = await signProductImageUploadAction();
      if (!signResult.ok) {
        setError(signResult.error);
        return;
      }
      const { cloudName, apiKey, folder, timestamp, signature, allowedFormats, maxFileSize } =
        signResult.signature;

      // Every one of these has to match exactly what was signed, or
      // Cloudinary's own signature check fails the request.
      const body = new FormData();
      body.set('file', file);
      body.set('api_key', apiKey);
      body.set('timestamp', String(timestamp));
      body.set('signature', signature);
      body.set('folder', folder);
      body.set('allowed_formats', allowedFormats);
      body.set('max_file_size', String(maxFileSize));

      const uploadResult = await uploadWithProgress(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        body,
        setProgress,
      );
      if (!uploadResult.ok) {
        const message = uploadResult.json?.error as { message?: string } | undefined;
        setError(message?.message ?? 'Upload to Cloudinary failed.');
        return;
      }
      const uploadJson = uploadResult.json;

      const saveResult = await saveProductImageAction(productId, {
        publicId: uploadJson.public_id as string,
        url: uploadJson.secure_url as string,
        format: uploadJson.format as string,
        width: uploadJson.width as number,
        height: uploadJson.height as number,
        alt: alt.trim(),
      });
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
        // anywhere yet — next/image needs a real, hostable src, and
        // Cloudinary's own optimisation applies once this is uploaded and
        // rendered as a real ProductImage instead.
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
