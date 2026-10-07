import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { formatReviewDate, looksLikeSpam } from '@/lib/reviews';
import { requireCatalogueAccess } from '@/lib/session';
import { deleteReviewAction, setReviewApprovedAction } from './actions';

const nf = new Intl.NumberFormat('en-IN');

/**
 * The moderation queue.
 *
 * Waiting is the default view, because the whole point of the screen is that
 * nothing a stranger typed reaches the storefront unread. A review sits here
 * until someone approves it.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireCatalogueAccess();

  const params = await searchParams;
  const show = params.show === 'published' ? 'published' : params.show === 'all' ? 'all' : 'waiting';

  const where: Prisma.ReviewWhereInput =
    show === 'waiting' ? { isApproved: false } : show === 'published' ? { isApproved: true } : {};

  const [reviews, waitingCount, publishedCount] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { product: { select: { name: true, slug: true } } },
    }),
    db.review.count({ where: { isApproved: false } }),
    db.review.count({ where: { isApproved: true } }),
  ]);

  return (
    <div>
      <h1 className="type-display-sm">Reviews</h1>
      <p className="mt-4 max-w-2xl type-body text-ink-soft">
        Nothing a customer writes appears in the shop until you approve it here.
      </p>

      <nav aria-label="Filter" className="mt-8 flex flex-wrap gap-2">
        {[
          { key: 'waiting', label: `Waiting (${nf.format(waitingCount)})` },
          { key: 'published', label: `Published (${nf.format(publishedCount)})` },
          { key: 'all', label: 'All' },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/reviews?show=${tab.key}`}
            aria-current={show === tab.key ? 'page' : undefined}
            className={`rounded-control border px-4 py-2 type-caption ${
              show === tab.key ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          {show === 'waiting'
            ? 'Nothing waiting. Every review has been dealt with.'
            : show === 'published'
              ? 'No reviews are published yet.'
              : 'No one has reviewed a product yet.'}
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {reviews.map((review) => {
            const suspect = !review.isApproved && looksLikeSpam(review.body);
            return (
              <li
                key={review.id}
                className={`rounded-card border p-6 ${suspect ? 'border-warning' : 'border-line'}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <p className="type-body">
                    <span aria-hidden>{'★'.repeat(review.rating)}</span>
                    <span className="sr-only">{review.rating} out of 5</span>{' '}
                    {review.title || 'No headline'}
                  </p>
                  <p className="type-caption text-ink-soft">
                    {review.isApproved ? 'Published' : 'Waiting'}
                  </p>
                </div>

                <p className="mt-2 type-caption normal-case text-ink-soft">
                  {review.authorName} · {formatReviewDate(review.createdAt)} ·{' '}
                  <Link href={`/products/${review.product.slug}`} className="text-signal">
                    {review.product.name}
                  </Link>
                </p>

                {suspect && (
                  <p className="mt-3 type-caption normal-case text-warning">
                    Looks like an advert — several links in the text. Read it before approving.
                  </p>
                )}

                <p className="mt-4 whitespace-pre-line type-body">{review.body}</p>

                <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-4">
                  <form action={setReviewApprovedAction.bind(null, review.id, !review.isApproved)}>
                    <button
                      type="submit"
                      className={`rounded-control px-6 py-3 type-body font-medium ${
                        review.isApproved
                          ? 'border border-line'
                          : 'bg-signal text-white'
                      }`}
                    >
                      {review.isApproved ? 'Unpublish' : 'Approve'}
                    </button>
                  </form>
                  <form action={deleteReviewAction.bind(null, review.id)}>
                    <button type="submit" className="type-body text-warning underline">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
