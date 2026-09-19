import 'server-only';
import { HEADER_BYTES, readImageDimensions, type Dimensions } from './image-header';
import { IMAGE_BUCKET, isOwnedPath } from './storage-shared';

/**
 * Supabase Storage. Server-side only — the service-role key must never reach
 * the browser.
 *
 * Replaces Cloudinary. The catalogue never used a single Cloudinary
 * transformation (no `f_auto`, `q_auto`, `w_`, `c_fill` anywhere): every image
 * is the stored URL rendered through `next/image`, which does its own AVIF and
 * WebP conversion. So the one real reason to stay was absent, and this keeps
 * the database and the files with one provider.
 *
 * Talks to the Storage REST API with `fetch` rather than `@supabase/supabase-js`.
 * Four calls are needed — sign, publish a URL, stat, delete — and the working
 * agreement says to ask before adding a dependency. A 200KB SDK for four
 * `fetch` calls did not earn it.
 *
 * The upload itself still never passes through this server: the browser is
 * handed a short-lived signed URL and PUTs the file straight to Supabase,
 * exactly as it used to POST straight to Cloudinary.
 */

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when Storage is configured. Image upload is disabled without it. */
export function isStorageConfigured(): boolean {
  return Boolean(url && serviceKey);
}

export function assertStorageConfigured(): void {
  if (!isStorageConfigured()) {
    throw new Error(
      'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
}

function serviceHeaders(): HeadersInit {
  return {
    apikey: serviceKey!,
    Authorization: `Bearer ${serviceKey!}`,
  };
}

/** The public URL an object is served from. The bucket is public-read. */
export function publicUrlFor(path: string): string {
  return `${url}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;
}

/** The host `next.config.ts` must allow, derived from the project URL. */
export function storageHostname(): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export interface SignedUpload {
  /** Absolute URL the browser PUTs the file to. Short-lived. */
  uploadUrl: string;
  /** Where the object will live inside the bucket. */
  path: string;
}

/**
 * A one-object, short-lived upload URL.
 *
 * Scoped to a single path chosen *here*, not by the caller's browser — which
 * is what stops a signed upload being replayed to overwrite a different
 * object. Supabase refuses an existing path unless upsert is asked for, and it
 * is not.
 */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  assertStorageConfigured();
  if (!isOwnedPath(path)) throw new Error('Refusing to sign an upload outside the image folder.');

  const response = await fetch(
    `${url}/storage/v1/object/upload/sign/${IMAGE_BUCKET}/${path}`,
    { method: 'POST', headers: { ...serviceHeaders(), 'Content-Type': 'application/json' }, body: '{}' },
  );

  if (!response.ok) {
    throw new Error(`Storage refused to sign the upload (${response.status}): ${await response.text()}`);
  }

  // The API returns a path-relative URL carrying the token.
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error('Storage returned no upload URL.');

  return { uploadUrl: `${url}/storage/v1${body.url}`, path };
}

export interface ObjectFacts {
  bytes: number;
  mimeType: string;
  dimensions: Dimensions | null;
}

/**
 * What the stored object actually is, read back from Storage rather than
 * believed from the browser.
 *
 * Supabase reports size and content type but nothing about pixels, so the
 * §9 long-edge rule is checked by fetching only the first `HEADER_BYTES` and
 * parsing the header — see `image-header.ts`. Cloudinary used to hand these
 * back for free; this is what replaces that, and it is why the rule is still
 * a real check rather than a claim the client makes about itself.
 */
export async function statObject(path: string): Promise<ObjectFacts | null> {
  assertStorageConfigured();
  if (!isOwnedPath(path)) return null;

  const response = await fetch(publicUrlFor(path), {
    headers: { ...serviceHeaders(), Range: `bytes=0-${HEADER_BYTES - 1}` },
  });
  if (!response.ok) return null;

  const buffer = new Uint8Array(await response.arrayBuffer());

  // A 206 reports the range in Content-Range ("bytes 0-65535/2400123"); a 200
  // means the whole object came back and its length is what was read.
  const contentRange = response.headers.get('content-range');
  const total = contentRange?.split('/')[1];
  const bytes = total && /^\d+$/.test(total) ? Number(total) : buffer.byteLength;

  return {
    bytes,
    mimeType: (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
    dimensions: readImageDimensions(buffer),
  };
}

/**
 * Removes an object, and only ever one of this app's own.
 *
 * Best-effort: an orphaned object is not worse than failing the request the
 * admin is already looking at — the same trade-off the Cloudinary version made.
 */
export async function removeObject(path: string): Promise<void> {
  if (!isStorageConfigured() || !isOwnedPath(path)) return;
  try {
    await fetch(`${url}/storage/v1/object/${IMAGE_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
    });
  } catch {
    // Swallowed on purpose; see above.
  }
}
