/**
 * The subset of `storage.ts` that carries no secret and no server import, so
 * it can be used from client components too (`storage.ts` itself is
 * `server-only` because it holds the service-role key).
 *
 * Replaces `cloudinary-shared.ts`. Product photos live in Supabase Storage
 * now — see the note at the top of `storage.ts` for why.
 */

/** The Storage bucket product imagery lives in. */
export const IMAGE_BUCKET = 'product-images';

/** Folder inside the bucket. One folder for the whole catalogue. */
export const IMAGE_FOLDER = 'products';

/**
 * Photography rules from §9, shown to the person uploading rather than
 * enforced silently. The admin renders this as an inline checklist.
 */
export const PHOTOGRAPHY_CHECKLIST = [
  'One product, centred, on a flat colour field matching its accent',
  'No lifestyle clutter, no hands, no kitchen sinks',
  'At least 2000px on the long edge',
  '1:1 for cards, 4:5 for the product hero',
  'No stock photography',
] as const;

/** Formats accepted from the admin uploader. */
export const ALLOWED_IMAGE_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'avif'] as const;

/** The MIME types those formats arrive as — also set on the bucket itself. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
] as const;

/** Long edge below which an upload is rejected, per the photography rules. */
export const MIN_LONG_EDGE_PX = 2000;

/** 20 MB — comfortably above any real product photo, well below "someone parked a video here". */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Where one upload is stored. The product id is in the path so an orphaned
 * object can be traced back to what it belonged to, and a random suffix keeps
 * two uploads of the same filename from overwriting each other.
 */
export function buildImagePath(productId: string, extension: string, random: string): string {
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
  return `${IMAGE_FOLDER}/${productId}/${random}.${safeExtension}`;
}

/** Every object this app creates lives under `IMAGE_FOLDER`. Anything else is not ours. */
export function isOwnedPath(path: string): boolean {
  return path.startsWith(`${IMAGE_FOLDER}/`) && !path.includes('..');
}

/** The file extension for a MIME type the uploader accepts. */
export function extensionForMimeType(mimeType: string): string | null {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    default:
      return null;
  }
}
