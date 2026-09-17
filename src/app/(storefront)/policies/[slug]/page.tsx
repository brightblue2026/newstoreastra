import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPolicy } from '@/lib/content';
import { isPolicySlug, policyBlocks } from '@/lib/content-schema';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

/*
  Shipping, returns, privacy and terms — written by BBTC in the admin.

  There is no fallback text. A policy that has not been published is a 404,
  not a page of generic terms: these are legal statements, and one BBTC never
  made is worse than none.
*/

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) return {};

  const policy = await getPolicy(slug);
  if (!policy) return {};

  return { title: policy.title, alternates: { canonical: `/policies/${slug}` } };
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();

  const policy = await getPolicy(slug);
  if (!policy) notFound();

  return (
    <article className="mx-auto max-w-(--container-page) px-6 py-24">
      <p className="type-caption text-ink-soft">Policies</p>
      <h1 className="mt-6 type-display-sm">{policy.title}</h1>
      <p className="mt-4 type-caption normal-case text-ink-soft">
        Last updated{' '}
        <time dateTime={policy.updatedAt.toISOString()}>
          {policy.updatedAt.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </time>
      </p>

      <div className="mt-12 max-w-2xl">
        {policyBlocks(policy.body).map((block, index) =>
          block.kind === 'heading' ? (
            <h2 key={index} className="mt-12 type-heading first:mt-0">
              {block.text}
            </h2>
          ) : (
            <p
              key={index}
              className="mt-6 whitespace-pre-line type-body-lg text-ink-soft first:mt-0"
            >
              {block.text}
            </p>
          ),
        )}
      </div>
    </article>
  );
}
