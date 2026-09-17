import 'server-only';
import { db } from '@/lib/db';
import {
  CONTENT_DEFAULTS,
  CONTENT_SCHEMAS,
  POLICY_SLUGS,
  policyKey,
  policySchema,
  type ContentData,
  type ContentKey,
  type PolicyData,
  type PolicySlug,
} from '@/lib/content-schema';

export type { ContentData, ContentKey } from '@/lib/content-schema';

/*
  The storefront's reader for `ContentBlock`.

  Shapes and defaults live in `content-schema.ts`, shared with the admin
  editor. This module only reads, and validates every row against the schema
  chosen by its key. A row that fails validation is discarded in favour of the
  default rather than crashing the homepage: bad admin input should degrade the
  hero, not take the site down.
*/

/**
 * Reads one content block, falling back to its default.
 *
 * Never throws. A missing row, malformed JSON, or an unreachable database all
 * resolve to the default so the homepage still renders — the storefront should
 * not go dark because someone saved a bad hero.
 */
export async function getContent<K extends ContentKey>(
  key: K,
): Promise<ContentData<K>> {
  try {
    const row = await db.contentBlock.findUnique({ where: { key } });
    if (!row || !row.isActive) return CONTENT_DEFAULTS[key];

    const parsed = CONTENT_SCHEMAS[key].safeParse(row.data);
    if (!parsed.success) {
      console.warn(
        `[content] "${key}" failed validation, using default:`,
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
      return CONTENT_DEFAULTS[key];
    }

    return parsed.data as ContentData<K>;
  } catch (error) {
    console.warn(`[content] "${key}" unavailable, using default:`, error);
    return CONTENT_DEFAULTS[key];
  }
}

export type PublishedPolicy = PolicyData & { updatedAt: Date };

/**
 * A published policy, or null. Policies have no default — see
 * `content-schema.ts` — so null means the page does not exist.
 */
export async function getPolicy(slug: PolicySlug): Promise<PublishedPolicy | null> {
  try {
    const row = await db.contentBlock.findUnique({ where: { key: policyKey(slug) } });
    if (!row || !row.isActive) return null;

    const parsed = policySchema.safeParse(row.data);
    if (!parsed.success) {
      console.warn(`[content] policy "${slug}" failed validation, hiding it`);
      return null;
    }
    return { ...parsed.data, updatedAt: row.updatedAt };
  } catch (error) {
    console.warn(`[content] policy "${slug}" unavailable:`, error);
    return null;
  }
}

/** Every published policy, in a fixed order, for the footer and the sitemap. */
export async function getPublishedPolicies(): Promise<
  { slug: PolicySlug; title: string; updatedAt: Date }[]
> {
  try {
    const rows = await db.contentBlock.findMany({
      where: { key: { in: POLICY_SLUGS.map(policyKey) }, isActive: true },
    });

    return POLICY_SLUGS.flatMap((slug) => {
      const row = rows.find((candidate) => candidate.key === policyKey(slug));
      const parsed = row ? policySchema.safeParse(row.data) : null;
      return row && parsed?.success
        ? [{ slug, title: parsed.data.title, updatedAt: row.updatedAt }]
        : [];
    });
  } catch (error) {
    console.warn('[content] policies unavailable:', error);
    return [];
  }
}
