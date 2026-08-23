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

export function ImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    setError(null);
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
      const { cloudName, apiKey, folder, timestamp, signature } = signResult.signature;

      const body = new FormData();
      body.set('file', file);
      body.set('api_key', apiKey);
      body.set('timestamp', String(timestamp));
      body.set('signature', signature);
      body.set('folder', folder);

      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body,
      });
      const uploadJson = await uploadResponse.json();
      if (!uploadResponse.ok) {
        setError(uploadJson?.error?.message ?? 'Upload to Cloudinary failed.');
        return;
      }

      const saveResult = await saveProductImageAction(productId, {
        publicId: uploadJson.public_id,
        url: uploadJson.secure_url,
        format: uploadJson.format,
        width: uploadJson.width,
        height: uploadJson.height,
        alt: alt.trim(),
      });
      if (!saveResult.ok) {
        setError(saveResult.error ?? 'Could not save that image.');
        return;
      }

      setAlt('');
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setError('Something went wrong reading or uploading that file.');
    } finally {
      setUploading(false);
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
        className="mt-2 w-full type-body"
      />

      {error && (
        <p role="alert" className="mt-4 rounded-control border border-warning px-4 py-3 type-body text-warning">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading}
        className="mt-6 rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}
