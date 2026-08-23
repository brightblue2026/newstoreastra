/**
 * The subset of `cloudinary.ts` that carries no secret and no SDK import, so
 * it can be imported from client components too (`cloudinary.ts` itself is
 * `server-only` because it configures the SDK with the API secret).
 */

/** Where product imagery lives. One folder for the whole catalogue. */
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
