import { z } from 'zod';

/**
 * Pure helpers for customer reviews.
 *
 * Framework-free so the arithmetic and the validation rules can be unit tested
 * without a database or a rendered form, matching `src/lib/money.ts` and
 * `admin/(panel)/inventory/stock.ts`.
 *
 * Reviews arrive unapproved and stay invisible until a manager approves them
 * (`Review.isApproved`, default `false`). Nothing here decides that — it is a
 * database default and an admin action — but every read helper below takes
 * only approved rows, so a caller cannot accidentally average in a review no
 * one has looked at yet.
 */

/** The star range. One to five, whole stars — no half stars anywhere. */
export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface ApprovedReview {
  rating: number;
}

export interface RatingSummary {
  count: number;
  /** Mean rating to one decimal place, or `null` when there is nothing to average. */
  average: number | null;
  /** How many reviews gave each star count, 5 down to 1. */
  distribution: { stars: number; count: number }[];
}

/**
 * The rating summary shown on a product.
 *
 * `average` is `null`, never `0`, when there are no reviews — the same
 * reasoning as a null price rendering "Price on request" rather than ₹0.00. A
 * zero average would claim every customer hated it.
 *
 * Rounded to one decimal because that is what is displayed and what goes into
 * `aggregateRating` in the product's JSON-LD; carrying more precision than is
 * ever shown invites the page and the structured data to disagree.
 */
export function summariseRatings(reviews: ApprovedReview[]): RatingSummary {
  const valid = reviews.filter((review) => isValidRating(review.rating));

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: valid.filter((review) => review.rating === stars).length,
  }));

  if (valid.length === 0) {
    return { count: 0, average: null, distribution };
  }

  const total = valid.reduce((sum, review) => sum + review.rating, 0);
  return {
    count: valid.length,
    average: Math.round((total / valid.length) * 10) / 10,
    distribution,
  };
}

export function isValidRating(rating: unknown): rating is number {
  return (
    typeof rating === 'number' &&
    Number.isInteger(rating) &&
    rating >= MIN_RATING &&
    rating <= MAX_RATING
  );
}

/** What share of reviews gave this many stars, as a percentage 0-100. */
export function sharePercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

/**
 * A review as submitted from the storefront.
 *
 * `authorName` is required because an unattributed review reads as fabricated,
 * which is the opposite of what reviews are for. Email is deliberately absent:
 * nothing here emails the reviewer, and collecting an address that is never
 * used is a liability, not a feature.
 */
export const reviewSubmissionSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  authorName: z
    .string()
    .trim()
    .min(2, 'Tell us your name, so other shoppers know who wrote this.')
    .max(80, 'That name is too long.'),
  rating: z.coerce
    .number()
    .int('Choose a star rating.')
    .min(MIN_RATING, 'Choose a star rating.')
    .max(MAX_RATING, 'Choose a star rating.'),
  title: z.string().trim().max(120, 'Keep the headline under 120 characters.').optional().or(z.literal('')),
  body: z
    .string()
    .trim()
    .min(20, 'Tell us a little more — at least a sentence or two.')
    .max(2000, 'That review is too long. Keep it under 2000 characters.'),
});

export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;

/**
 * A crude spam signal: a body that is mostly a URL is an advert, not a review.
 *
 * Deliberately not a blocklist of words. Reviews are held for approval anyway,
 * so this only saves a manager from reading the most obvious rubbish — it is
 * not, and must not be treated as, the thing keeping spam off the site.
 */
export function looksLikeSpam(body: string): boolean {
  const links = body.match(/https?:\/\/|www\./gi)?.length ?? 0;
  return links >= 2;
}

/** "17 Sep 2026" — the Indian format the admin copy rules ask for. */
export function formatReviewDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
