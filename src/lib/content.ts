import 'server-only';
import { z } from 'zod';
import { db } from '@/lib/db';

/*
  Homepage content — the `ContentBlock` table, given a shape.

  `ContentBlock.data` is untyped JSON with a unique `key`. This module is the
  only thing that reads it, and it validates every row against a schema chosen
  by that key. A row that fails validation is discarded in favour of the
  default rather than crashing the homepage: bad admin input should degrade the
  hero, not take the site down.

  Every block has a code-level default. That means:
    - the page renders on a database with no content rows at all
    - copy is editable from the admin without a deploy
    - a default is never a *placeholder* — nothing here is lorem, and nothing
      states a fact the business has not confirmed

  Deliberately absent: anything gated on brief §14. No GSTIN (Q6 — the same
  number is published for two entities), no fragrance names (Q2 — the two
  sources disagree on which 24), no prices (Q7).
*/

// ---------- Schemas ----------

const announcementBar = z.object({
  items: z.array(z.string().min(1)).min(1).max(8),
});

const homeHero = z.object({
  eyebrow: z.string().min(1),
  /** Headline is split so one word can carry the second type register. */
  before: z.string(),
  emphasis: z.string().min(1),
  after: z.string(),
  body: z.string().min(1),
  ctaLabel: z.string().min(1),
  ctaHref: z.string().min(1),
});

const worldRecord = z.object({
  count: z.number().int().positive(),
  headline: z.string().min(1),
  body: z.string().min(1),
});

const trustBadges = z.object({
  badges: z
    .array(z.object({ label: z.string().min(1), detail: z.string().min(1) }))
    .min(1)
    .max(6),
});

const homeSteps = z.object({
  eyebrow: z.string().min(1),
  steps: z
    .array(
      z.object({
        img: z.string().min(1),
        alt: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1),
      }),
    )
    .min(2)
    .max(6),
});

const homeStory = z.object({
  heading: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
});

const SCHEMAS = {
  announcement_bar: announcementBar,
  home_hero: homeHero,
  world_record: worldRecord,
  trust_badges: trustBadges,
  home_steps: homeSteps,
  home_story: homeStory,
} as const;

export type ContentKey = keyof typeof SCHEMAS;
export type ContentData<K extends ContentKey> = z.infer<(typeof SCHEMAS)[K]>;

// ---------- Defaults ----------

const DEFAULTS: { [K in ContentKey]: ContentData<K> } = {
  announcement_bar: {
    items: [
      'Eight brands, one manufacturer',
      'International Book of Records holder',
      // "dishwash" is load-bearing now that MAKAFA sells actual perfume: without
      // it, the record reads as though it were about the fragrance brand.
      '24 fragrances of MX-3 dishwash',
      'Made in Kerala',
    ],
  },

  home_hero: {
    eyebrow: 'Bright Blue Trading Corporation',
    before: '24 scents.',
    emphasis: 'One obsession.',
    after: '',
    body: 'Home care, personal care, food and fragrance, manufactured in Kerala since 2019. Eight brands under one roof.',
    ctaLabel: 'Shop all',
    ctaHref: '/shop',
  },

  world_record: {
    count: 24,
    headline: 'fragrance variants of one dishwashing liquid.',
    body: 'MX-3 holds the International Book of Records for the maximum number of fragrance variants created for a dishwashing liquid brand. Awarded to Mr. Faisal V.K. for Bright Blue Trading Corporation.',
  },

  trust_badges: {
    badges: [
      { label: 'Made in Kerala', detail: 'Registered in Ernakulam, manufactured in Palakkad' },
      { label: 'Eight brands', detail: 'Cleaning, personal care, food and fragrance, one manufacturer' },
      { label: 'Bulk & distributor', detail: 'Wholesale pricing for trade enquiries' },
      { label: 'Since 2019', detail: 'Founded by V.K. Faisal' },
    ],
  },

  // Copy only. The images are supplied by whoever seeds this block — there is
  // no default art, because inventing a photograph is worse than an empty
  // section. See the note in the homepage where this is consumed.
  home_steps: {
    eyebrow: 'From our floor to yours',
    steps: [
      {
        img: '',
        alt: '',
        title: 'Formulate',
        body: 'Every formula is developed and tested in-house before it reaches a filling line.',
      },
      {
        img: '',
        alt: '',
        title: 'Fill',
        body: 'Filled and sealed at our own units, in the sizes the trade actually orders.',
      },
      {
        img: '',
        alt: '',
        title: 'Dispatch',
        body: 'Packed and dispatched to distributors and retailers across Kerala.',
      },
    ],
  },

  home_story: {
    heading: 'One company, eight houses',
    paragraphs: [
      'Bright Blue Trading Corporation was founded in 2019 by V.K. Faisal. What began as a single cleaning line has become eight brands spanning cleaning, personal care, food and fragrance — all manufactured rather than resold.',
      'The registered office is in Ernakulam; manufacturing runs from Palakkad. Between them sit the formulation, filling and packing units that make every product sold here.',
    ],
  },
};

// ---------- Reader ----------

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
    if (!row || !row.isActive) return DEFAULTS[key];

    const parsed = SCHEMAS[key].safeParse(row.data);
    if (!parsed.success) {
      console.warn(
        `[content] "${key}" failed validation, using default:`,
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
      return DEFAULTS[key];
    }

    return parsed.data as ContentData<K>;
  } catch (error) {
    console.warn(`[content] "${key}" unavailable, using default:`, error);
    return DEFAULTS[key];
  }
}

/** The default for a key, for the admin editor to seed a form with. */
export function getContentDefault<K extends ContentKey>(key: K): ContentData<K> {
  return DEFAULTS[key];
}

export { SCHEMAS as CONTENT_SCHEMAS };
