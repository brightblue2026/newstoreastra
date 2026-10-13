'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import {
  assertStorageConfigured,
  createSignedUpload,
  isStorageConfigured,
  publicUrlFor,
  removeObject,
  statObject,
} from '@/lib/storage';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildImagePath,
  extensionForMimeType,
  isOwnedPath,
  isUploadPathFor,
} from '@/lib/storage-shared';

const idSchema = z.string().trim().min(1).max(64);

export interface UploadTicket {
  /** Absolute URL the browser PUTs the file to. */
  uploadUrl: string;
  /** Where the object will live — handed back on save so the server can find it. */
  path: string;
  maxFileSize: number;
}

export type SignResult = { ok: true; ticket: UploadTicket } | { ok: false; error: string };

/**
 * Hands the uploader a short-lived, single-object upload URL. The file goes
 * straight from the browser to Supabase Storage and never passes through this
 * server.
 *
 * The destination path is chosen here, not by the caller: the browser only
 * says what kind of file it is. A caller-chosen path would let a signed
 * upload be aimed at someone else's object.
 */
export async function signProductImageUploadAction(
  productId: string,
  mimeType: string,
): Promise<SignResult> {
  await requireCatalogueAccess();

  const parsedId = idSchema.safeParse(productId);
  if (!parsedId.success) return { ok: false, error: 'That product no longer exists.' };

  try {
    assertStorageConfigured();
  } catch (error) {
    // The thrown message names the environment variables, which is the right
    // detail for whoever runs the deployment and the wrong thing to put in
    // front of a shop owner. It goes to the server log; the admin gets a
    // sentence in their own language telling them who can fix it.
    console.error('[images] upload refused:', error instanceof Error ? error.message : error);
    return {
      ok: false,
      error:
        'Photo uploads are not set up yet. Ask whoever manages the site to connect its Supabase storage.',
    };
  }

  const product = await db.product.findUnique({ where: { id: parsedId.data }, select: { id: true } });
  if (!product) return { ok: false, error: 'That product no longer exists.' };

  const extension = extensionForMimeType(mimeType);
  if (!extension) return { ok: false, error: 'Unsupported format — use PNG, JPEG, WebP or AVIF.' };

  try {
    const { uploadUrl, path } = await createSignedUpload(
      buildImagePath(product.id, extension, randomUUID()),
    );
    return { ok: true, ticket: { uploadUrl, path, maxFileSize: MAX_UPLOAD_BYTES } };
  } catch (error) {
    console.error('[images] could not sign upload:', error);
    return { ok: false, error: 'Could not start the upload. Try again.' };
  }
}

export interface SaveImageResult {
  ok: boolean;
  error?: string;
}

/**
 * Only ever removes an object under this app's own image folder — a
 * caller-supplied path naming something else is silently refused rather than
 * trusted, since a MANAGER session should be able to affect this store's
 * product images and nothing else in the bucket.
 */
async function safeRemove(path: string): Promise<void> {
  if (!isStorageConfigured() || !isOwnedPath(path)) return;
  await removeObject(path);
}

/**
 * Cleanup for a rejected save. Stricter than `safeRemove`: the path must be
 * one signed for this product, and no `ProductImage` row may point at it.
 * Without both, a save with blank alt text naming a live photo's path deleted
 * that photo from storage, with no audit entry and a broken image left behind.
 */
async function discardUnsavedUpload(path: string, productId: string): Promise<void> {
  if (!isUploadPathFor(path, productId)) return;
  const linked = await db.productImage.count({ where: { publicId: path } });
  if (linked === 0) await safeRemove(path);
}

const saveSchema = z.object({
  productId: idSchema,
  path: z.string().trim().min(1),
  alt: z.string().trim().min(1, 'Alt text is required.').max(200),
});

/**
 * Called after the browser has already PUT the file straight to Supabase
 * Storage. Writes the `ProductImage` row — but only after re-reading what
 * actually landed in the bucket.
 *
 * Nothing about the file is taken from the caller any more. Cloudinary used to
 * return authoritative width, height, bytes and format, and the old version of
 * this action re-checked those. Supabase reports size and content type and
 * nothing about pixels, so `statObject` re-reads all four from the stored
 * object itself — size and type from the response headers, dimensions by
 * parsing the first 64KB. The browser now sends only a path and alt text,
 * neither of which it can lie about usefully: the path was chosen by the
 * server when it signed the upload.
 *
 * A file that fails these checks is deleted rather than left as an orphaned,
 * never-linked object.
 */
export async function saveProductImageAction(
  productId: string,
  upload: { path: string; alt: string },
): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();

  const parsed = saveSchema.safeParse({ ...upload, productId });
  if (!parsed.success) {
    if (typeof upload?.path === 'string' && typeof productId === 'string') {
      await discardUnsavedUpload(upload.path, productId);
    }
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid upload.' };
  }

  // Only the path this product's signing step could have issued. Refused
  // without deleting anything: it may well be another product's live photo.
  if (!isUploadPathFor(parsed.data.path, parsed.data.productId)) {
    return { ok: false, error: 'Not a recognised upload.' };
  }
  const alreadyLinked = await db.productImage.count({ where: { publicId: parsed.data.path } });
  if (alreadyLinked > 0) return { ok: false, error: 'That photo is already saved.' };

  const discard = () => discardUnsavedUpload(parsed.data.path, parsed.data.productId);

  const product = await db.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) {
    await discard();
    return { ok: false, error: 'That product no longer exists.' };
  }

  const facts = await statObject(parsed.data.path);
  if (!facts) {
    return { ok: false, error: 'That upload did not arrive. Try again.' };
  }

  if (facts.bytes > MAX_UPLOAD_BYTES) {
    await discard();
    return { ok: false, error: `Image must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.` };
  }

  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(facts.mimeType)) {
    await discard();
    return { ok: false, error: 'Unsupported image format.' };
  }

  // `null` here means the header did not parse as any format the uploader
  // accepts — a renamed PDF, a truncated file, an SVG. Refused, never waved
  // through: the content type is only what the uploader claimed. Any pixel
  // size is accepted; the dimensions are read to prove the file is an image.
  if (!facts.dimensions) {
    await discard();
    return { ok: false, error: 'That file is not a readable image.' };
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
        url: publicUrlFor(parsed.data.path),
        // `publicId` keeps its column name and now holds the storage path —
        // the same role it always had: the handle the object is deleted by.
        publicId: parsed.data.path,
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

/**
 * Swaps an image's `sortOrder` with its neighbour on the requested side.
 * `sortOrder` ascending is what both this grid and the storefront's cover
 * image (`product.images[0]`) key off — see `(storefront)/products/[slug]`
 * — so this is the only lever an admin needs to change which photo leads,
 * without deleting and re-uploading in a different order. A no-op at either
 * edge rather than an error: the button there is simply disabled.
 */
const moveDirectionSchema = z.enum(['up', 'down']);

export async function moveProductImageAction(
  productId: string,
  imageId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const user = await requireCatalogueAccess();
  const parsedDirection = moveDirectionSchema.safeParse(direction);
  if (!parsedDirection.success) return;
  if (!idSchema.safeParse(productId).success || !idSchema.safeParse(imageId).success) return;

  const swapped = await db.$transaction(async (tx) => {
    // Same per-product lock as the upload path — two admins reordering the
    // same product's images at once must serialise, not interleave.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;

    const images = await tx.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, sortOrder: true },
    });

    const index = images.findIndex((image) => image.id === imageId);
    if (index === -1) return null;

    const targetIndex = parsedDirection.data === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return null;

    const current = images[index];
    const target = images[targetIndex];

    const [updatedCurrent, updatedTarget] = await Promise.all([
      tx.productImage.update({ where: { id: current.id }, data: { sortOrder: target.sortOrder } }),
      tx.productImage.update({ where: { id: target.id }, data: { sortOrder: current.sortOrder } }),
    ]);

    return { updatedCurrent, updatedTarget, before: { current, target } };
  });

  if (!swapped) return;

  await Promise.all([
    recordAudit({
      userId: user.id,
      action: 'update',
      entityType: 'ProductImage',
      entityId: swapped.updatedCurrent.id,
      before: swapped.before.current,
      after: { sortOrder: swapped.updatedCurrent.sortOrder },
    }),
    recordAudit({
      userId: user.id,
      action: 'update',
      entityType: 'ProductImage',
      entityId: swapped.updatedTarget.id,
      before: swapped.before.target,
      after: { sortOrder: swapped.updatedTarget.sortOrder },
    }),
  ]);

  revalidatePath(`/admin/products/${productId}/images`);
}

export async function deleteProductImageAction(productId: string, imageId: string): Promise<void> {
  const user = await requireCatalogueAccess();
  if (!idSchema.safeParse(productId).success || !idSchema.safeParse(imageId).success) return;

  const existing = await db.productImage.findUnique({ where: { id: imageId } });
  if (!existing || existing.productId !== productId) return;

  await db.productImage.delete({ where: { id: imageId } });
  await safeRemove(existing.publicId);

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
