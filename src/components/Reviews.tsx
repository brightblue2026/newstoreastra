import { formatReviewDate, sharePercent, summariseRatings, type RatingSummary } from '@/lib/reviews';
import { Reveal, RevealItem } from '@/components/Reveal';
import { ReviewForm } from '@/components/ReviewForm';

export interface StorefrontReview {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: Date;
}

/** Stars as text, with the number for anyone not looking at the glyphs. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="type-body">
      <span aria-hidden className="tracking-widest">
        {'★'.repeat(rating)}
        <span className="text-line">{'★'.repeat(5 - rating)}</span>
      </span>
      <span className="sr-only">{rating} out of 5</span>
    </span>
  );
}

function Summary({ summary }: { summary: RatingSummary }) {
  if (summary.average === null) return null;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-12">
      <div>
        <p className="type-display-sm tabular-nums">{summary.average.toFixed(1)}</p>
        <Stars rating={Math.round(summary.average)} />
        <p className="mt-1 type-caption text-ink-soft">
          {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
        </p>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {summary.distribution.map((band) => (
          <li key={band.stars} className="flex items-center gap-3">
            <span className="w-12 shrink-0 type-caption text-ink-soft">{band.stars} star</span>
            <span className="h-2 min-w-0 flex-1 rounded-full bg-line">
              <span
                className="block h-2 rounded-full bg-ink"
                style={{ width: `${sharePercent(band.count, summary.count)}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right type-caption tabular-nums text-ink-soft">
              {band.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Reviews on a product page.
 *
 * Only approved reviews ever reach this component — the query that feeds it
 * filters on `isApproved`, and `summariseRatings` averages exactly what it is
 * given. An unapproved review is invisible here and absent from the average,
 * which is the point of moderation.
 */
export function Reviews({
  productId,
  reviews,
}: {
  productId: string;
  reviews: StorefrontReview[];
}) {
  const summary = summariseRatings(reviews);

  return (
    <section className="mt-24 border-t border-line pt-16">
      <Reveal>
        <RevealItem>
          <h2 className="type-heading">Reviews</h2>
        </RevealItem>

        {summary.count === 0 ? (
          <RevealItem>
            <p className="mt-4 max-w-2xl type-body text-ink-soft">
              No one has reviewed this yet. If you have used it, yours would be the first.
            </p>
          </RevealItem>
        ) : (
          <>
            <RevealItem>
              <div className="mt-8">
                <Summary summary={summary} />
              </div>
            </RevealItem>

            <RevealItem>
              <ul className="mt-12 flex flex-col gap-8">
                {reviews.map((review) => (
                  <li key={review.id} className="border-t border-line pt-6">
                    <Stars rating={review.rating} />
                    {review.title && <p className="mt-2 type-subhead">{review.title}</p>}
                    <p className="mt-1 type-caption text-ink-soft">
                      {review.authorName} · {formatReviewDate(review.createdAt)}
                    </p>
                    <p className="mt-3 max-w-2xl whitespace-pre-line type-body">{review.body}</p>
                  </li>
                ))}
              </ul>
            </RevealItem>
          </>
        )}

        <RevealItem>
          <div className="mt-12 max-w-2xl">
            <h3 className="type-subhead">Write a review</h3>
            <p className="mt-2 type-body text-ink-soft">
              Someone reads every review before it appears.
            </p>
            <div className="mt-6">
              <ReviewForm productId={productId} />
            </div>
          </div>
        </RevealItem>
      </Reveal>
    </section>
  );
}
