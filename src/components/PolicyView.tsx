import type { Metadata } from 'next';
import Link from 'next/link';
import { lastUpdatedLabel } from '@/lib/business';
import { getPolicy } from '@/lib/content';
import { policyBlocks, type PolicySlug } from '@/lib/content-schema';
import { defaultPolicy, POLICY_ROUTES } from '@/lib/policy-defaults';

/*
  One policy page: shipping, refunds, privacy or terms.

  A policy published from /admin/content is shown as written. Until one is,
  the standing text in `policy-defaults.ts` is shown instead, so the page
  always exists. The markup is the same as /policies/[slug], which predates
  these routes and still serves the admin-written text only.
*/

/** Pages a policy may point at; a mention of one in the text becomes a link. */
const INTERNAL_LINK = /(\/(?:shipping-policy|refund-policy|privacy-policy|terms|contact))(?![\w-])/;

function withLinks(text: string): React.ReactNode[] {
  return text.split(INTERNAL_LINK).map((part, index) =>
    index % 2 === 1 ? (
      <Link key={index} href={part} className="underline">
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

async function resolve(slug: PolicySlug) {
  const published = await getPolicy(slug);
  const standing = defaultPolicy(slug);
  return published
    ? {
        title: published.title,
        description: standing.description,
        body: published.body,
        updated: published.updatedAt.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      }
    : { ...standing, updated: lastUpdatedLabel() };
}

export async function policyMetadata(slug: PolicySlug): Promise<Metadata> {
  const policy = await resolve(slug);
  return {
    title: policy.title,
    description: policy.description,
    alternates: { canonical: POLICY_ROUTES[slug].path },
  };
}

export default async function PolicyView({ slug }: { slug: PolicySlug }) {
  const policy = await resolve(slug);

  return (
    <article className="mx-auto max-w-(--container-page) px-6 py-24">
      <p className="type-caption text-ink-soft">Policies</p>
      <h1 className="mt-6 type-display-sm">{policy.title}</h1>
      <p className="mt-4 type-caption normal-case text-ink-soft">Last updated {policy.updated}</p>

      <div className="mt-12 max-w-2xl">
        {policyBlocks(policy.body).map((block, index) =>
          block.kind === 'heading' ? (
            <h2 key={index} className="mt-12 type-heading first:mt-0">
              {block.text}
            </h2>
          ) : (
            <p
              key={index}
              className="mt-6 whitespace-pre-line break-words type-body-lg text-ink-soft first:mt-0"
            >
              {withLinks(block.text)}
            </p>
          ),
        )}
      </div>
    </article>
  );
}
