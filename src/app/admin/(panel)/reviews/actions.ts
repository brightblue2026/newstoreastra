'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';

const idSchema = z.string().trim().min(1).max(64);

/**
 * Approve or unapprove one review.
 *
 * Unapproving is as important as approving and is not a delete: a review that
 * turns out to be about the wrong product, or that the customer asks to have
 * taken down, should stop being public without the text disappearing from the
 * audit trail.
 */
export async function setReviewApprovedAction(reviewId: string, isApproved: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const parsed = idSchema.safeParse(reviewId);
  if (!parsed.success) return;

  const existing = await db.review.findUnique({
    where: { id: parsed.data },
    include: { product: { select: { slug: true } } },
  });
  if (!existing) return;
  if (existing.isApproved === isApproved) return;

  const updated = await db.review.update({
    where: { id: existing.id },
    data: { isApproved },
  });

  await recordAudit({
    userId: user.id,
    action: isApproved ? 'reactivate' : 'deactivate',
    entityType: 'Review',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/reviews');
  // The product page renders approved reviews and the rating summary, so both
  // change the moment this does.
  revalidatePath(`/products/${existing.product.slug}`);
}

/**
 * Deletes a review outright.
 *
 * For abuse and spam, where unapproving is not enough because nobody should
 * have to keep reading it. The full row goes into the audit log first, so a
 * deletion can still be accounted for afterwards.
 */
export async function deleteReviewAction(reviewId: string): Promise<void> {
  const user = await requireCatalogueAccess();

  const parsed = idSchema.safeParse(reviewId);
  if (!parsed.success) return;

  const existing = await db.review.findUnique({
    where: { id: parsed.data },
    include: { product: { select: { slug: true } } },
  });
  if (!existing) return;

  await db.review.delete({ where: { id: existing.id } });

  // No dedicated "delete" audit action exists yet — `deactivate` with
  // `after: null` is the precedent ComboItem and ProductImage removal use.
  await recordAudit({
    userId: user.id,
    action: 'deactivate',
    entityType: 'Review',
    entityId: existing.id,
    before: existing,
    after: null,
  });

  revalidatePath('/admin/reviews');
  revalidatePath(`/products/${existing.product.slug}`);
}
