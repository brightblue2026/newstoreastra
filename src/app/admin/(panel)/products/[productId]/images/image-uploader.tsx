'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  PHOTOGRAPHY_CHECKLIST,
} from '@/lib/storage-shared';
import { checkPhotoFile, sendPhoto } from './send-photo';

/*
  The upload itself never touches this app's server: the browser asks for a
  short-lived signed URL, PUTs the file straight to Supabase Storage, and only
  the *path* comes back here to be written into `ProductImage`. That keeps a
  multi-megabyte product photo off the Next.js server entirely. The sending is
  in `send-photo.ts`, shared with the one-press button on the variants list.

  The format and file-size checks run twice — once here, against the file the
  browser can already see, so a bad upload is never even attempted; once more
  in `saveProductImageAction`, which re-reads them from the stored object
  rather than believing anything sent from here. There is no pixel-size rule.

  Several photos can be chosen at once. Each is checked the moment it is
  chosen, gets its own description, its own progress and its own outcome, so
  it is never a guess which ones were stored.
*/

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(',');

/** Longest edge of the thumbnail kept for the queue, in pixels. */
const THUMBNAIL_PX = 240;

/**
 * Decodes the file once, for both its pixel dimensions and a small preview.
 *
 * Deliberately not `URL.createObjectURL` + `<img>` — that path loads the blob
 * as a page resource, which the CSP's `img-src` (self, data:, the storage
 * host) then blocks, since a `blob:` URL matches none of those.
 * `createImageBitmap` decodes the file in memory without going through the
 * resource-fetch pipeline at all, and the preview leaves as a `data:` URL,
 * which `img-src` already allows. The preview is drawn down to a thumbnail
 * first: a queue of full-size photos held as data URLs is hundreds of
 * megabytes of page state on the phone this is often used from.
 */
async function readImage(
  file: File,
): Promise<{ width: number; height: number; preview: string | null }> {
  let bitmap: ImageBitmap;
  try {
    // Preview decoding is optional. A browser that cannot decode AVIF should
    // still allow the server's authoritative header validation.
    const decoding = createImageBitmap(file);
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    decoding.then((result) => { if (expired) result.close(); }, () => {});
    try {
      bitmap = await Promise.race([decoding, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error('preview-timeout')); }, 10_000);
      })]);
    } finally { clearTimeout(timer); }
  } catch {
    throw new Error('This file could not be read as an image.');
  }
  const { width, height } = bitmap;
  let preview: string | null = null;
  try {
    const scale = Math.min(1, THUMBNAIL_PX / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    preview = canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    // No preview is not a reason to refuse the photo.
  }
  bitmap.close();
  return { width, height, preview };
}

type QueueStatus = 'checking' | 'ready' | 'uploading' | 'refused' | 'failed';

interface QueuedPhoto {
  id: string;
  file: File;
  alt: string;
  preview: string | null;
  status: QueueStatus;
  progress: number;
  stage?: string;
  /** Why it was refused or failed, in words the person can act on. */
  message: string | null;
}

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countPhotos(count: number): string {
  return count === 1 ? '1 photo' : `${count} photos`;
}

/** Everything that can be known about a file before it is sent anywhere. */
async function inspect(file: File): Promise<Pick<QueuedPhoto, 'preview' | 'status' | 'message'>> {
  const refusal = checkPhotoFile(file);
  if (refusal) return { preview: null, status: 'refused', message: refusal };
  try {
    // Any pixel size is accepted; decoding it is only to prove it is an image
    // and to make the thumbnail.
    const { preview } = await readImage(file);
    return { preview, status: 'ready', message: null };
  } catch {
    return { preview: null, status: 'ready', message: 'Preview unavailable. The file will be checked when uploaded.' };
  }
}

/** The other variants one photo can be shared with: the other sizes of a fragrance. */
export interface PhotoSiblings {
  /** "the other 3 sizes of Lemon" */
  label: string;
  variantIds: string[];
}

/**
 * Adds photos to one thing: the product as a whole, or — when `variantId` is
 * given — that one variant. Each variant has its own page with its own
 * uploader, so nothing here asks which variant a photo is for.
 */
export function ImageUploader({
  productId,
  defaultAlt,
  variantId,
  siblings,
}: {
  productId: string;
  defaultAlt: string;
  variantId?: string;
  siblings?: PhotoSiblings;
}) {
  // A fragrance's photo is usually the same picture for every size of it, so
  // sharing is one tick rather than the same upload repeated per size.
  const [share, setShare] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  function patch(id: string, change: Partial<QueuedPhoto>) {
    setQueue((current) => current.map((photo) => (photo.id === id ? { ...photo, ...change } : photo)));
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setSuccess(null);
    const stamp = Date.now();
    // Show every selection immediately; decoding must not hide the entire queue.
    const added: QueuedPhoto[] = files.map((file, index) => ({
      id: `${idPrefix}${stamp}-${index}`, file, alt: defaultAlt,
      preview: null, status: 'checking', message: null, progress: 0,
    }));
    setQueue((current) => [...current, ...added]);
    for (const photo of added) patch(photo.id, await inspect(photo.file));
    // So choosing the same file again still fires `change`.
    if (inputRef.current) inputRef.current.value = '';
  }

  /** Signs, sends and records one photo. Resolves to whether it was saved. */
  async function uploadOne(photo: QueuedPhoto): Promise<boolean> {
    const alt = photo.alt.trim();
    if (!alt) {
      patch(photo.id, { status: 'failed', message: 'Describe the photo first. Alt text is required.' });
      return false;
    }

    patch(photo.id, { status: 'uploading', progress: 0, message: null });
    const result = await sendPhoto({
      productId,
      file: photo.file,
      alt,
      variantIds: variantId ? [variantId, ...(share && siblings ? siblings.variantIds : [])] : [],
      onProgress: (progress) => patch(photo.id, { progress }),
      onStage: (stage) => patch(photo.id, { stage }),
    });
    if (!result.ok) {
      patch(photo.id, { status: 'failed', message: result.message });
      return false;
    }
    return true;
  }

  async function handleUpload() {
    setSuccess(null);
    const pending = queue.filter((photo) => photo.status === 'ready' || photo.status === 'failed');
    if (pending.length === 0) return;

    setUploading(true);
    let saved = 0;
    try {
      // One at a time: the order they finish in is the order they are shown
      // in, and the first one becomes the cover.
      for (const photo of pending) {
        if (await uploadOne(photo)) {
          saved += 1;
          setQueue((current) => current.filter((entry) => entry.id !== photo.id));
          // The saved photo appears in the list below as soon as it is stored,
          // not when the whole batch is done.
          router.refresh();
        }
      }
    } finally {
      setUploading(false);
    }

    if (saved > 0) {
      const failed = pending.length - saved;
      setSuccess(
        `${countPhotos(saved)} saved to this product` +
          (failed > 0
            ? `. ${failed} could not be saved. The reason is shown on each one above.`
            : '. You can see them under "Saved photos" below.'),
      );
    }
  }

  const sendable = queue.filter((photo) => photo.status === 'ready' || photo.status === 'failed').length;

  return (
    <div className="mt-8 max-w-2xl rounded-card border border-line p-6">
      <p className="type-caption text-ink-soft">Before uploading</p>
      <ul className="mt-2 list-inside list-disc type-body text-ink-soft">
        {PHOTOGRAPHY_CHECKLIST.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      {/* The label is the drop zone and the button: pressing it opens the file
          picker, and the real input stays in the tab order behind it. */}
      <label
        htmlFor="imageFile"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
        className={`mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center focus-within:outline-2 focus-within:outline-signal ${
          dragging ? 'border-signal bg-sky' : 'border-line bg-white hover:bg-sky'
        }`}
      >
        <span className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white">
          Choose photos
        </span>
        <span className="type-body text-ink-soft">
          or drag them onto this box. You can pick several at once.
        </span>
        <span className="type-caption normal-case text-ink-soft">
          PNG, JPEG, WebP or AVIF · any size · up to{' '}
          {Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB each
        </span>
        <input
          id="imageFile"
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(event) => void addFiles(Array.from(event.target.files ?? []))}
          className="sr-only"
        />
      </label>

      {siblings && (
        <label className="mt-6 flex items-start gap-3 type-body">
          <input
            type="checkbox"
            id="sharePhotos"
            checked={share}
            disabled={uploading}
            onChange={(event) => setShare(event.target.checked)}
            className="mt-1"
          />
          <span>
            Also use these photos for {siblings.label}
            <span className="block type-caption normal-case text-ink-soft">
              Leave this off when each size has a different photo.
            </span>
          </span>
        </label>
      )}

      {queue.length > 0 && (
        <ul className="mt-6 grid grid-cols-1 gap-4">
          {queue.map((photo, index) => {
            const altId = index === 0 ? 'imageAlt' : `imageAlt-${index}`;
            return (
              <li key={photo.id} className="flex min-w-0 gap-4 rounded-control border border-line p-3">
                {photo.preview ? (
                  // A local data: thumbnail of a file that has not been uploaded
                  // anywhere yet — next/image needs a real, hostable src.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.preview}
                    alt=""
                    className="aspect-square w-20 shrink-0 rounded-control border border-line object-cover"
                  />
                ) : (
                  <div className="aspect-square w-20 shrink-0 rounded-control border border-line bg-paper" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <p className="min-w-0 truncate type-caption normal-case text-ink-soft">
                      {photo.file.name} · {fileSize(photo.file.size)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setQueue((current) => current.filter((entry) => entry.id !== photo.id))}
                      disabled={uploading}
                      className="shrink-0 type-caption text-ink-soft underline disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>

                  {photo.status === 'checking' && <p role="status" className="mt-2 type-body">Preparing preview…</p>}
                  {photo.status !== 'refused' && (
                    <>
                      <label htmlFor={altId} className="mt-2 block type-caption text-ink-soft">
                        Describe this photo (alt text)
                      </label>
                      <input
                        id={altId}
                        value={photo.alt}
                        maxLength={200}
                        onChange={(event) => patch(photo.id, { alt: event.target.value })}
                        disabled={uploading}
                        placeholder="MX Three Dish Wash Liquid, Lemon, 450 ml"
                        className="mt-1 w-full rounded-control border border-line bg-white px-3 py-2 type-body"
                      />
                    </>
                  )}

                  {photo.status === 'uploading' && (
                    <>
                      <p role="status" className="mt-2 type-caption normal-case text-ink-soft">
                        {photo.stage === 'Uploading…' ? `Uploading… ${photo.progress}%` : photo.stage ?? 'Preparing upload…'}
                      </p>
                      <div
                        role="progressbar"
                        aria-label={`Upload progress for ${photo.file.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={photo.progress}
                        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line"
                      >
                        <div className="motion-lift h-full bg-signal" style={{ width: `${photo.progress}%` }} />
                      </div>
                    </>
                  )}

                  {photo.message && (
                    <p role="alert" className="mt-2 type-caption normal-case text-warning">
                      {photo.status === 'refused' ? 'Cannot be used. ' : photo.status === 'failed' ? 'Not saved. ' : ''}
                      {photo.message}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {success && !uploading && (
        <p role="status" className="mt-6 rounded-control border border-success px-4 py-3 type-body text-success">
          {success}
        </p>
      )}

      {queue.length > 0 && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || sendable === 0 || queue.some((photo) => photo.status === 'checking')}
          className="mt-6 rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : `Upload ${countPhotos(sendable)}`}
        </button>
      )}
    </div>
  );
}
