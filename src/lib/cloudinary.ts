import 'server-only';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary. Server-side only — the API secret must never reach the browser.
 *
 * Uploads in the admin go through a signed request rather than an unsigned
 * preset, so the folder, the allowed formats and the size ceiling are decided
 * here and cannot be overridden by whoever is holding the form.
 */

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

/** True when Cloudinary is configured. Image upload is disabled without it. */
export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && apiKey && apiSecret);
}

export function assertCloudinaryConfigured(): void {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
    );
  }
}

/** Where product imagery lives. One folder per brand slug, set at upload time. */
export const CLOUDINARY_FOLDER = 'bright-blue/products';

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

/** Long edge below which an upload is rejected, per the photography rules. */
export const MIN_LONG_EDGE_PX = 2000;

export { cloudinary };
