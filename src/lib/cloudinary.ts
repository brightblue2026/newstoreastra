import 'server-only';
import { v2 as cloudinary } from 'cloudinary';
import {
  ALLOWED_IMAGE_FORMATS,
  CLOUDINARY_FOLDER,
  MIN_LONG_EDGE_PX,
  PHOTOGRAPHY_CHECKLIST,
} from './cloudinary-shared';

/**
 * Cloudinary. Server-side only — the API secret must never reach the browser.
 *
 * Uploads in the admin go through a signed request rather than an unsigned
 * preset, so the folder, the allowed formats and the size ceiling are decided
 * here and cannot be overridden by whoever is holding the form — `folder`,
 * `allowed_formats` and `max_file_size` are all part of what actually gets
 * signed in `signProductImageUploadAction`
 * (`products/[productId]/images/actions.ts`), enforced by Cloudinary itself
 * regardless of which resource-type endpoint the signed request is sent to.
 * `resource_type` itself is deliberately never signed — Cloudinary excludes
 * it from the signature by design, since it's chosen by the URL path, not a
 * request parameter.
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

export { cloudinary, ALLOWED_IMAGE_FORMATS, CLOUDINARY_FOLDER, MIN_LONG_EDGE_PX, PHOTOGRAPHY_CHECKLIST };
