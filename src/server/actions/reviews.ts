'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { looksLikeSpam, reviewSubmissionSchema } from '@/lib/reviews';

export interface ReviewFormState {
  error?: string;
  fieldErrors?: Partial<Record<'authorName' | 'rating' | 'title' | 'body', string>>;
  /** Echoed back on failure so a rejected submit does not wipe what was typed. */
  fields?: { authorName: string; rating: string; title: string; body: string };
  done?: boolean;
}

/**
 * A customer leaving a review. Public — no session, by design: requiring an
 * account to review a bottle of dishwash would mean almost no reviews, and the
 * account area does not exist yet anyway.
 *
 * Which makes moderation the whole safety model. Every review is written with
 * `isApproved: false` (the schema default) and is invisible to everyone but an
 * admin until a manager approves it. Nothing a stranger types reaches the
 * storefront unread.
 */
export async function submitReviewAction(
  _previous: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const raw = {
    productId: String(formData.get('productId') ?? ''),
    authorName: String(formData.get('authorName') ?? ''),
    rating: String(formData.get('rating') ?? ''),
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
  };
  const echo = {
    authorName: raw.authorName,
    rating: raw.rating,
    title: raw.title,
    body: raw.body,
  };

  const parsed = reviewSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: ReviewFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'authorName' || key === 'rating' || key === 'title' || key === 'body') {
        fieldErrors[key] ??= issue.message;
      }
    }
    return { error: 'Check the highlighted fields.', fieldErrors, fields: echo };
  }

  // Five an hour per address. `checkRateLimit` degrades to "allowed" when
  // Upstash is unconfigured rather than throwing — the same direction every
  // other caller takes, and the reason checkout did not break the day rate
  // limiting was added. See `lib/rate-limit.ts`.
  const limit = await checkRateLimit('review-submit', clientIpFrom(await headers()), 5, 3600);
  if (!limit.allowed) {
    return {
      error: 'That is a lot of reviews in one go. Try again in a little while.',
      fields: echo,
    };
  }

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, isActive: true },
    select: { id: true, slug: true },
  });
  // Deliberately the same message as a genuinely missing product: a review form
  // is a public endpoint, and confirming which ids exist is free reconnaissance.
  if (!product) return { error: 'That product is not available to review.', fields: echo };

  await db.review.create({
    data: {
      productId: product.id,
      authorName: parsed.data.authorName,
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      body: parsed.data.body,
      // Explicit rather than leaning on the column default: this is the line
      // that keeps unread text off the storefront, and it should be visible
      // here rather than only in the schema.
      isApproved: false,
    },
  });

  // Nothing to revalidate on the storefront — the review is not public yet —
  // but the moderation queue should show it immediately.
  revalidatePath('/admin/reviews');

  // `looksLikeSpam` only sorts the queue; it never refuses a submission. A
  // real review that happens to quote two links should not be silently binned,
  // and a manager reads every one of these anyway.
  if (looksLikeSpam(parsed.data.body)) {
    console.warn('[reviews] likely spam queued for moderation on product', product.slug);
  }

  return { done: true };
}
