'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import {
  ALLOWED_IMAGE_FORMATS,
  assertCloudinaryConfigured,
  CLOUDINARY_FOLDER,
  cloudinary,
  isCloudinaryConfigured,
  MIN_LONG_EDGE_PX,
} from '@/lib/cloudinary';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';

/** 20 MB — comfortably above any real product photo, well below "someone parked a video here". */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
  allowedFormats: string;
  maxFileSize: number;
}

export type SignResult = { ok: true; signature: UploadSignature } | { ok: false; error: string };

/**
 * Called directly from the uploader before it POSTs the file straight to
 * Cloudinary — the file itself never passes through this server. Every param
 * actually being signed (`timestamp`, `folder`, `allowed_formats`,
 * `max_file_size`) must be sent back unchanged with the upload, or Cloudinary's
 * own signature check fails; adding an unsigned param there would too.
 *
 * `resource_type` is deliberately NOT signed — Cloudinary excludes it from the
 * string that gets signed regardless (it's chosen by the URL path, e.g.
 * `/image/upload` vs `/raw/upload`), so including it here would only produce
 * a signature that can never match. `allowed_formats` is what actually stops
 * a validly-signed request from being replayed against a different endpoint
 * to upload a non-image: Cloudinary rejects the format at its own layer no
 * matter which resource-type path the request is sent to — verified directly
 * against the real account before shipping this, not assumed from the docs.
 */
export async function signProductImageUploadAction(): Promise<SignResult> {
  await requireCatalogueAccess();

  try {
    assertCloudinaryConfigured();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Cloudinary is not configured.' };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const allowedFormats = ALLOWED_IMAGE_FORMATS.join(',');
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: CLOUDINARY_FOLDER, allowed_formats: allowedFormats, max_file_size: MAX_UPLOAD_BYTES },
    process.env.CLOUDINARY_API_SECRET!,
  );

  return {
    ok: true,
    signature: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      folder: CLOUDINARY_FOLDER,
      timestamp,
      signature,
      allowedFormats,
      maxFileSize: MAX_UPLOAD_BYTES,
    },
  };
}

export interface SaveImageResult {
  ok: boolean;
  error?: string;
}

/**
 * Every asset this app ever legitimately creates lives under `CLOUDINARY_FOLDER`
 * — enforced here so a `publicId` naming something outside it (a brand logo,
 * anything else in the same Cloudinary account) is rejected before it ever
 * reaches a destroy call, rather than trusted because it merely looks
 * plausible.
 */
function isOwnedPublicId(publicId: string): boolean {
  return publicId.startsWith(`${CLOUDINARY_FOLDER}/`);
}

const uploadResultSchema = z.object({
  publicId: z.string().trim().min(1).refine(isOwnedPublicId, 'Not a recognised upload.'),
  url: z.string().trim().url(),
  format: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1, 'Alt text is required.').max(200),
});

/**
 * Only ever destroys an asset under this app's own Cloudinary folder — a
 * caller-supplied `publicId` naming something else (a brand logo, anything
 * else in the same Cloudinary account) is silently refused rather than
 * trusted, since a MANAGER session should be able to affect this store's
 * product images and nothing else in the account.
 */
async function safeDestroy(publicId: string): Promise<void> {
  if (!isCloudinaryConfigured() || !isOwnedPublicId(publicId)) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Best-effort: an orphaned Cloudinary asset is not worse than failing
    // the request the admin is already looking at.
  }
}

/**
 * Called after the browser has already uploaded the file straight to
 * Cloudinary. Re-checks the photography rules server-side — the client check
 * is only ever a courtesy — and only then writes the `ProductImage` row.
 * A file that fails these checks is removed from Cloudinary rather than left
 * as an orphaned, never-linked asset.
 */
export async function saveProductImageAction(
  productId: string,
  upload: { publicId: string; url: string; format: string; width: number; height: number; alt: string },
): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();

  const parsed = uploadResultSchema.safeParse(upload);
  if (!parsed.success) {
    if (upload.publicId) await safeDestroy(upload.publicId);
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid upload.' };
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) {
    await safeDestroy(parsed.data.publicId);
    return { ok: false, error: 'That product no longer exists.' };
  }

  const longEdge = Math.max(parsed.data.width, parsed.data.height);
  if (longEdge < MIN_LONG_EDGE_PX) {
    await safeDestroy(parsed.data.publicId);
    return { ok: false, error: `Image must be at least ${MIN_LONG_EDGE_PX}px on the long edge.` };
  }

  const format = parsed.data.format.toLowerCase();
  if (!(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(format)) {
    await safeDestroy(parsed.data.publicId);
    return { ok: false, error: 'Unsupported image format.' };
  }

  const created = await db.$transaction(async (tx) => {
    // Postgres won't allow `SELECT MAX(...) ... FOR UPDATE` (FOR UPDATE
    // rejects aggregates), so a per-product advisory lock is what actually
    // closes the race: two uploads for the same product now serialize
    // through this lock instead of both reading the same max and colliding.
    // Transaction-scoped — released automatically on commit or rollback.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;

    const maxSort = await tx.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });

    return tx.productImage.create({
      data: {
        productId,
        url: parsed.data.url,
        publicId: parsed.data.publicId,
        alt: parsed.data.alt,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  });

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'ProductImage',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath(`/admin/products/${productId}/images`);
  return { ok: true };
}

export async function deleteProductImageAction(productId: string, imageId: string): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.productImage.findUnique({ where: { id: imageId } });
  if (!existing || existing.productId !== productId) return;

  await db.productImage.delete({ where: { id: imageId } });
  await safeDestroy(existing.publicId);

  // No dedicated "delete" audit action exists yet (PROGRESS.md, "Known gaps
  // found during review") — `deactivate` with `after: null` is the same
  // precedent ComboItem removal already uses.
  await recordAudit({
    userId: user.id,
    action: 'deactivate',
    entityType: 'ProductImage',
    entityId: imageId,
    before: existing,
    after: null,
  });

  revalidatePath(`/admin/products/${productId}/images`);
}
