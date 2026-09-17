import { z } from 'zod';

/*
  Content block shapes — the `ContentBlock` table, given a shape.

  `ContentBlock.data` is untyped JSON with a unique `key`. This module is the
  one definition of what each key may hold, shared by three callers that must
  never disagree: the storefront reader (`content.ts`, server-only), the admin
  editor that writes rows, and the tests. It is pure — no database, no
  `server-only` — so the tests can import it.

  Every homepage block has a code-level default. That means:
    - the page renders on a database with no content rows at all
    - copy is editable from the admin without a deploy
    - a default is never a *placeholder* — nothing here is lorem, and nothing
      states a fact the business has not confirmed

  Policies are the exception, on purpose: they have **no** default. Shipping,
  returns, privacy and terms are BBTC's legal statements, and inventing one is
  worse than not having the page. An unwritten policy has no page and no
  footer link.
*/

// ---------- Field helpers ----------

function required(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

function optional(label: string, max: number) {
  return z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);
}

/**
 * Where the hero button may point: a page on this site, or an https address.
 *
 * This value lands in an `href` on every visitor's homepage, so `javascript:`,
 * protocol-relative `//host` and the `/\host` form browsers also treat as
 * off-site are all refused — a manager's typo must not become a script.
 */
const SAFE_HREF = /^(\/(?![/\\])\S*|https:\/\/[^\s/\\]\S*)$/;

// ---------- Schemas ----------

const announcementBar = z.object({
  items: z
    .array(required('Text', 120))
    .min(1, 'Add at least one announcement.')
    .max(8, 'Eight announcements at most.'),
});

const homeHero = z.object({
  eyebrow: required('Eyebrow', 80),
  /** Headline is split so one word can carry the second type register. */
  before: optional('Headline start', 80),
  emphasis: required('Emphasised words', 60),
  after: optional('Headline end', 80),
  body: required('Introduction', 400),
  ctaLabel: required('Button label', 40),
  ctaHref: z
    .string()
    .trim()
    .max(300, 'Button link must be 300 characters or fewer.')
    .regex(
      SAFE_HREF,
      'Button link must be a page on this site, starting with /, or a full https:// address.',
    ),
});

const worldRecord = z.object({
  count: z
    .number({ message: 'The count must be a whole number.' })
    .int('The count must be a whole number.')
    .positive('The count must be above zero.')
    .max(9999, 'The count must be 9999 or less.'),
  headline: required('Headline', 160),
  body: required('Description', 600),
});

const trustBadges = z.object({
  badges: z
    .array(z.object({ label: required('Label', 40), detail: required('Detail', 160) }))
    .min(1, 'Add at least one badge.')
    .max(6, 'Six badges at most.'),
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
  heading: required('Heading', 120),
  paragraphs: z
    .array(required('Text', 2000))
    .min(1, 'Add at least one paragraph.')
    .max(12, 'Twelve paragraphs at most.'),
});

export const policySchema = z.object({
  title: required('Page title', 120),
  body: required('Policy text', 50_000),
});

export const CONTENT_SCHEMAS = {
  announcement_bar: announcementBar,
  home_hero: homeHero,
  world_record: worldRecord,
  trust_badges: trustBadges,
  home_steps: homeSteps,
  home_story: homeStory,
} as const;

export type ContentKey = keyof typeof CONTENT_SCHEMAS;
export type ContentData<K extends ContentKey> = z.infer<(typeof CONTENT_SCHEMAS)[K]>;
export type PolicyData = z.infer<typeof policySchema>;

// ---------- Defaults ----------

export const CONTENT_DEFAULTS: { [K in ContentKey]: ContentData<K> } = {
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

// ---------- What the admin editor can reach ----------

/**
 * Blocks with an editor. `home_steps` is deliberately absent: it is
 * photography-led and needs an image upload, not a URL box a non-technical
 * editor cannot fill in. It keeps its coded default until that exists.
 */
export const EDITABLE_CONTENT_KEYS = [
  'announcement_bar',
  'home_hero',
  'world_record',
  'trust_badges',
  'home_story',
] as const satisfies readonly ContentKey[];

export type EditableContentKey = (typeof EDITABLE_CONTENT_KEYS)[number];

export const CONTENT_META: Record<EditableContentKey, { label: string; where: string }> = {
  announcement_bar: {
    label: 'Announcement bar',
    where: 'The scrolling strip above the header, on every page.',
  },
  home_hero: {
    label: 'Homepage hero',
    where: 'The top of the homepage: headline, introduction and button.',
  },
  world_record: {
    label: 'World record',
    where: 'The record section on the homepage and the Our story page.',
  },
  trust_badges: {
    label: 'Trust badges',
    where: 'The row of short facts below the record on the homepage.',
  },
  home_story: {
    label: 'Company story',
    where: 'The story section on the homepage and the Our story page.',
  },
};

export const POLICY_SLUGS = ['shipping', 'returns', 'privacy', 'terms'] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];
export type PolicyKey = `policy_${PolicySlug}`;

export const POLICY_META: Record<PolicySlug, { label: string; where: string }> = {
  shipping: { label: 'Shipping and delivery', where: 'Where you deliver, how long it takes, what it costs.' },
  returns: { label: 'Returns and refunds', where: 'What can come back, and how. Food returns differ from detergent.' },
  privacy: { label: 'Privacy policy', where: 'What customer data is collected and what it is used for.' },
  terms: { label: 'Terms of sale', where: 'The conditions a customer accepts when ordering.' },
};

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

export function policyKey(slug: PolicySlug): PolicyKey {
  return `policy_${slug}`;
}

export type EditorKey = EditableContentKey | PolicyKey;

export const EDITOR_KEYS: readonly EditorKey[] = [
  ...EDITABLE_CONTENT_KEYS,
  ...POLICY_SLUGS.map(policyKey),
];

/** Validates a key arriving from a URL or a bound action argument. */
export const editorKeySchema = z.enum(EDITOR_KEYS as [EditorKey, ...EditorKey[]]);

export function policySlugOf(key: EditorKey): PolicySlug | null {
  return key.startsWith('policy_') ? (key.slice('policy_'.length) as PolicySlug) : null;
}

export function schemaForEditorKey(key: EditorKey): z.ZodType {
  return policySlugOf(key) ? policySchema : CONTENT_SCHEMAS[key as EditableContentKey];
}

// ---------- Form ↔ data ----------

/** How many badge rows the editor offers — the schema's own maximum. */
export const TRUST_BADGE_SLOTS = 6;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** One entry per non-blank line. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** One entry per blank-line-separated block — how people already write paragraphs. */
export function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

/**
 * Turns the editor's form fields into a candidate block. Nothing here is
 * trusted: the result still goes through `schemaForEditorKey(key).safeParse`.
 * Lists are written as plain text (one line, or one paragraph, per entry)
 * because that is what a non-technical editor can manage without add/remove
 * buttons.
 */
export function contentFromForm(key: EditorKey, form: FormData): unknown {
  if (policySlugOf(key)) {
    return { title: field(form, 'title'), body: field(form, 'body') };
  }

  switch (key as EditableContentKey) {
    case 'announcement_bar':
      return { items: linesOf(field(form, 'items')) };

    case 'home_hero':
      return {
        eyebrow: field(form, 'eyebrow'),
        before: field(form, 'before'),
        emphasis: field(form, 'emphasis'),
        after: field(form, 'after'),
        body: field(form, 'body'),
        ctaLabel: field(form, 'ctaLabel'),
        ctaHref: field(form, 'ctaHref'),
      };

    case 'world_record': {
      const raw = field(form, 'count').trim();
      return {
        count: raw === '' ? Number.NaN : Number(raw),
        headline: field(form, 'headline'),
        body: field(form, 'body'),
      };
    }

    case 'trust_badges': {
      const badges = Array.from({ length: TRUST_BADGE_SLOTS }, (_, slot) => ({
        label: field(form, `badgeLabel-${slot}`),
        detail: field(form, `badgeDetail-${slot}`),
      }));
      // Empty rows at the end were never used. An empty row in the middle is
      // kept, so a validation error names the same row number the editor sees.
      while (badges.length > 0) {
        const last = badges[badges.length - 1];
        if (last.label.trim() || last.detail.trim()) break;
        badges.pop();
      }
      return { badges };
    }

    case 'home_story':
      return {
        heading: field(form, 'heading'),
        paragraphs: paragraphsOf(field(form, 'paragraphs')),
      };
  }
}

const ROW_NOUNS: Record<string, string> = {
  items: 'Announcement',
  badges: 'Badge',
  paragraphs: 'Paragraph',
};

/** Validation issues as sentences an editor can act on, naming the row. */
export function describeIssues(issues: z.ZodError['issues']): string[] {
  const messages = issues.map((issue) => {
    const [list, index] = issue.path;
    if (typeof list === 'string' && typeof index === 'number' && ROW_NOUNS[list]) {
      return `${ROW_NOUNS[list]} ${index + 1}: ${issue.message}`;
    }
    return issue.message;
  });
  return [...new Set(messages)];
}

// ---------- Policy rendering ----------

export type PolicyBlock = { kind: 'heading' | 'paragraph'; text: string };

/**
 * A policy's text as headings and paragraphs. Blank lines separate
 * paragraphs; a line starting with `#` is a heading. That is the whole
 * syntax — enough for a legal page, little enough to explain in one hint.
 */
export function policyBlocks(body: string): PolicyBlock[] {
  return paragraphsOf(body).flatMap((block): PolicyBlock[] => {
    if (!block.startsWith('#')) return [{ kind: 'paragraph', text: block }];

    const [first, ...rest] = block.split('\n');
    const heading = first.replace(/^#+\s*/, '').trim();
    const remainder = rest.join('\n').trim();
    const out: PolicyBlock[] = [];
    if (heading) out.push({ kind: 'heading', text: heading });
    if (remainder) out.push({ kind: 'paragraph', text: remainder });
    return out;
  });
}
