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
import { PHOTO_ALREADY_REPLACED } from './photo-messages';

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
  // Empty: a photo of the product as a whole. Otherwise the variants it shows.
  variantIds: z.array(idSchema).max(500).default([]),
});

/**
 * Checks a file the browser says it has uploaded: the size, type and
 * readable dimensions are read back from the stored object, never taken from
 * the browser. A file that fails is deleted rather than left unlinked.
 */
async function verifyStoredFile(path: string, productId: string): Promise<SaveImageResult> {
  const facts = await statObject(path);
  if (!facts) {
    return { ok: false, error: 'That upload did not arrive. Try again.' };
  }

  const discard = () => discardUnsavedUpload(path, productId);

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

  return { ok: true };
}

/**
 * After any photo change: the admin pages showing it, the catalogue-wide
 * Photos page, and — when the product is on the store — the store, so a
 * photo edited after publishing shows there on the next visit rather than
 * after the 60-second refresh. Same reach as publishing a variant.
 */
async function afterPhotoChange(productId: string): Promise<void> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { isActive: true } });
  if (product?.isActive) revalidatePath('/', 'layout');
  revalidatePath(`/admin/products/${productId}`, 'layout');
  revalidatePath('/admin/products');
  revalidatePath('/admin/photos');
}

/** One saved photo row, only if it belongs to this product. */
async function findPhoto(productId: string, imageId: string) {
  if (!idSchema.safeParse(productId).success || !idSchema.safeParse(imageId).success) return null;
  const image = await db.productImage.findUnique({ where: { id: imageId } });
  return image && image.productId === productId ? image : null;
}

const GONE = 'That photo is no longer there. Refresh the page to see the current photos.';

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
  upload: { path: string; alt: string; variantIds?: string[] },
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

  // A photo can only be attached to this product's own variants.
  const variantIds = [...new Set(parsed.data.variantIds)];
  if (variantIds.length > 0) {
    const owned = await db.productVariant.count({
      where: { id: { in: variantIds }, productId: product.id },
    });
    if (owned !== variantIds.length) {
      await discard();
      return {
        ok: false,
        error: 'A variant chosen for this photo no longer exists. Refresh the page and choose again.',
      };
    }
  }

  const verified = await verifyStoredFile(parsed.data.path, parsed.data.productId);
  if (!verified.ok) return verified;

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

    const data = {
      productId,
      url: publicUrlFor(parsed.data.path),
      // `publicId` keeps its column name and now holds the storage path —
      // the same role it always had: the handle the object is deleted by.
      publicId: parsed.data.path,
      alt: parsed.data.alt,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    };

    if (variantIds.length === 0) return [await tx.productImage.create({ data })];

    // One stored photo, one row per variant it shows: a fragrance's photo is
    // the same picture for every size of it. The rows share `publicId`;
    // `deleteProductImageAction` removes the file with the last of them.
    return tx.productImage.createManyAndReturn({
      data: variantIds.map((variantId) => ({ ...data, variantId })),
    });
  });

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'ProductImage',
    entityId: created[0].id,
    before: null,
    after: { ...created[0], variantIds },
  });

  await afterPhotoChange(productId);
  return { ok: true };
}

/**
 * Changes a photo's description. The same picture shown for several variants
 * is several rows; they all get the new words, so one picture never carries
 * two different descriptions.
 */
const altSchema = z.string().trim().min(1, 'Write a short description of the photo.').max(200, 'Keep the description under 200 characters.');

export async function updateImageAltAction(
  productId: string,
  imageId: string,
  alt: string,
): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();
  const parsedAlt = altSchema.safeParse(alt);
  if (!parsedAlt.success) return { ok: false, error: parsedAlt.error.issues[0]?.message ?? 'Invalid description.' };

  const image = await findPhoto(productId, imageId);
  if (!image) return { ok: false, error: GONE };

  await db.productImage.updateMany({
    where: { productId, publicId: image.publicId },
    data: { alt: parsedAlt.data },
  });
  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'ProductImage',
    entityId: image.id,
    before: { alt: image.alt },
    after: { alt: parsedAlt.data },
  });

  await afterPhotoChange(productId);
  return { ok: true };
}

/**
 * The photos a row is ordered among: the product's general photos, or one
 * variant's own photos. The store leads with the first of each.
 */
const sameScope = (productId: string, variantId: string | null) => ({ productId, variantId });

/** Puts a photo first in its group — the cover, or the variant's lead photo. */
export async function makeImageFirstAction(productId: string, imageId: string): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();
  const image = await findPhoto(productId, imageId);
  if (!image) return { ok: false, error: GONE };

  const moved = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
    const first = await tx.productImage.findFirst({
      where: sameScope(productId, image.variantId),
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, sortOrder: true },
    });
    if (!first || first.id === image.id) return null;
    return tx.productImage.update({ where: { id: image.id }, data: { sortOrder: first.sortOrder - 1 } });
  });

  if (moved) {
    await recordAudit({
      userId: user.id,
      action: 'update',
      entityType: 'ProductImage',
      entityId: image.id,
      before: { sortOrder: image.sortOrder },
      after: { sortOrder: moved.sortOrder },
    });
  }
  await afterPhotoChange(productId);
  return { ok: true };
}

/**
 * Swaps an image's `sortOrder` with its neighbour on the requested side,
 * among the photos of the same group (general, or the same variant).
 * `sortOrder` ascending is what both the admin and the storefront key off, so
 * this is how an admin changes which photo leads without re-uploading. A
 * no-op at either edge rather than an error: the button there is disabled.
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
  const image = await findPhoto(productId, imageId);
  if (!image) return;

  const swapped = await db.$transaction(async (tx) => {
    // Same per-product lock as the upload path — two admins reordering the
    // same product's images at once must serialise, not interleave.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;

    const images = await tx.productImage.findMany({
      where: sameScope(productId, image.variantId),
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, sortOrder: true },
    });

    const index = images.findIndex((entry) => entry.id === imageId);
    if (index === -1) return null;

    const targetIndex = parsedDirection.data === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return null;

    const current = images[index];
    const target = images[targetIndex];
    // Equal numbers (two photos saved at once for different variants, later
    // grouped) would swap to the same order; nudge so the move is visible.
    const [currentOrder, targetOrder] =
      current.sortOrder === target.sortOrder
        ? parsedDirection.data === 'up'
          ? [target.sortOrder - 1, target.sortOrder]
          : [target.sortOrder + 1, target.sortOrder]
        : [target.sortOrder, current.sortOrder];

    const [updatedCurrent, updatedTarget] = await Promise.all([
      tx.productImage.update({ where: { id: current.id }, data: { sortOrder: currentOrder } }),
      tx.productImage.update({ where: { id: target.id }, data: { sortOrder: targetOrder } }),
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

  await afterPhotoChange(productId);
}

/**
 * Replaces the picture of a saved photo with a newly uploaded file. Every
 * row showing the old picture switches to the new one, so its place, its
 * description and the variants it is used for all stay. The old file is
 * removed once nothing points at it.
 */
export async function replaceProductImageAction(
  productId: string,
  imageId: string,
  upload: { path: string },
): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();
  const path = typeof upload?.path === 'string' ? upload.path.trim() : '';
  if (!idSchema.safeParse(productId).success || !isUploadPathFor(path, productId)) {
    return { ok: false, error: 'Not a recognised upload.' };
  }

  const image = await findPhoto(productId, imageId);
  if (!image) {
    // Asked again after an answer was lost, the row may already show the new
    // file; otherwise the photo really was deleted meanwhile.
    await discardUnsavedUpload(path, productId);
    return { ok: false, error: GONE };
  }
  if (image.publicId === path) return { ok: false, error: PHOTO_ALREADY_REPLACED };

  const alreadyLinked = await db.productImage.count({ where: { publicId: path } });
  if (alreadyLinked > 0) return { ok: false, error: 'That photo is already saved.' };

  const verified = await verifyStoredFile(path, productId);
  if (!verified.ok) return verified;

  const oldPath = image.publicId;
  await db.productImage.updateMany({
    where: { productId, publicId: oldPath },
    data: { publicId: path, url: publicUrlFor(path) },
  });
  if ((await db.productImage.count({ where: { publicId: oldPath } })) === 0) await safeRemove(oldPath);

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'ProductImage',
    entityId: image.id,
    before: { publicId: oldPath, url: image.url },
    after: { publicId: path, url: publicUrlFor(path), note: 'Photo replaced' },
  });

  await afterPhotoChange(productId);
  return { ok: true };
}

/**
 * Chooses where one picture is shown: the product as a whole, and/or any of
 * its variants. Rows are added or removed to match; the file is never copied.
 */
const usageSchema = z.object({
  general: z.boolean(),
  variantIds: z.array(idSchema).max(500),
});

export async function setImageVariantsAction(
  productId: string,
  imageId: string,
  usage: { general: boolean; variantIds: string[] },
): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();
  const parsed = usageSchema.safeParse(usage);
  if (!parsed.success) return { ok: false, error: 'Choose where this photo is used.' };
  const variantIds = [...new Set(parsed.data.variantIds)];
  if (!parsed.data.general && variantIds.length === 0) {
    return {
      ok: false,
      error: 'Tick at least one place. To take this photo off everything, delete it instead.',
    };
  }

  const image = await findPhoto(productId, imageId);
  if (!image) return { ok: false, error: GONE };

  if (variantIds.length > 0) {
    const owned = await db.productVariant.count({ where: { id: { in: variantIds }, productId } });
    if (owned !== variantIds.length) {
      return { ok: false, error: 'A variant ticked here no longer exists. Refresh the page and try again.' };
    }
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
    const rows = await tx.productImage.findMany({ where: { productId, publicId: image.publicId } });
    const want = new Set<string | null>([...(parsed.data.general ? [null] : []), ...variantIds]);
    const have = new Set(rows.map((row) => row.variantId));

    const removing = rows.filter((row) => !want.has(row.variantId)).map((row) => row.id);
    const adding = [...want].filter((variantId) => !have.has(variantId));

    if (removing.length > 0) await tx.productImage.deleteMany({ where: { id: { in: removing } } });
    if (adding.length > 0) {
      const maxSort = await tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
      await tx.productImage.createMany({
        data: adding.map((variantId) => ({
          productId,
          variantId,
          url: image.url,
          publicId: image.publicId,
          alt: image.alt,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        })),
      });
    }
    return { before: rows.map((row) => row.variantId), added: adding.length, removed: removing.length };
  });

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'ProductImage',
    entityId: image.id,
    before: { usedFor: result.before },
    after: { general: parsed.data.general, variantIds },
  });

  await afterPhotoChange(productId);
  return { ok: true };
}

/**
 * Deletes photo rows of one product, then any stored file nothing points at
 * any more. Shared by the single and the bulk delete.
 */
async function deleteRows(userId: string, productId: string, rowIds: string[]): Promise<number> {
  const rows = await db.productImage.findMany({ where: { id: { in: rowIds }, productId } });
  if (rows.length === 0) return 0;

  await db.productImage.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });

  for (const publicId of new Set(rows.map((row) => row.publicId))) {
    if ((await db.productImage.count({ where: { publicId } })) === 0) await safeRemove(publicId);
  }

  // No dedicated "delete" audit action exists yet (PROGRESS.md, "Known gaps
  // found during review") — `deactivate` with `after: null` is the same
  // precedent ComboItem removal already uses.
  await Promise.all(
    rows.map((row) =>
      recordAudit({
        userId,
        action: 'deactivate',
        entityType: 'ProductImage',
        entityId: row.id,
        before: row,
        after: null,
      }),
    ),
  );
  return rows.length;
}

/**
 * Deletes one photo. `this` takes it off the variant (or the product) it was
 * deleted from — other variants showing the same picture keep it.
 * `everywhere` removes every use of the picture in this product.
 */
export async function deleteProductImageAction(
  productId: string,
  imageId: string,
  scope: 'this' | 'everywhere' = 'this',
): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();
  const image = await findPhoto(productId, imageId);
  if (!image) return { ok: true }; // already gone: the outcome asked for

  const rowIds =
    scope === 'everywhere'
      ? (
          await db.productImage.findMany({
            where: { productId, publicId: image.publicId },
            select: { id: true },
          })
        ).map((row) => row.id)
      : [image.id];

  await deleteRows(user.id, productId, rowIds);
  await afterPhotoChange(productId);
  return { ok: true };
}

/** Deletes several selected photos of one product at once. */
const bulkSchema = z.array(idSchema).min(1).max(200);

export async function deleteProductImagesAction(
  productId: string,
  imageIds: string[],
): Promise<SaveImageResult> {
  const user = await requireCatalogueAccess();
  const parsed = bulkSchema.safeParse(imageIds);
  if (!parsed.success || !idSchema.safeParse(productId).success) {
    return { ok: false, error: 'Select the photos to delete.' };
  }
  await deleteRows(user.id, productId, [...new Set(parsed.data)]);
  await afterPhotoChange(productId);
  return { ok: true };
}
