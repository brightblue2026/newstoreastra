import { describe, expect, it } from 'vitest';
import {
  CONTENT_DEFAULTS,
  CONTENT_SCHEMAS,
  EDITABLE_CONTENT_KEYS,
  contentFromForm,
  describeIssues,
  editorKeySchema,
  paragraphsOf,
  policyBlocks,
  policySchema,
  schemaForEditorKey,
  type EditorKey,
} from './content-schema';

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

function validate(key: EditorKey, entries: Record<string, string>) {
  const result = schemaForEditorKey(key).safeParse(contentFromForm(key, form(entries)));
  return result.success
    ? { ok: true as const, data: result.data as Record<string, unknown> }
    : { ok: false as const, messages: describeIssues(result.error.issues) };
}

const HERO = {
  eyebrow: 'Bright Blue Trading Corporation',
  before: '24 scents.',
  emphasis: 'One obsession.',
  after: '',
  body: 'Manufactured in Kerala.',
  ctaLabel: 'Shop all',
  ctaHref: '/shop',
};

describe('content defaults', () => {
  it('every editable default passes its own schema', () => {
    for (const key of EDITABLE_CONTENT_KEYS) {
      expect(CONTENT_SCHEMAS[key].safeParse(CONTENT_DEFAULTS[key]).success, key).toBe(true);
    }
  });
});

describe('editorKeySchema', () => {
  it('accepts editable blocks and policies', () => {
    expect(editorKeySchema.safeParse('home_hero').success).toBe(true);
    expect(editorKeySchema.safeParse('policy_returns').success).toBe(true);
  });

  it('refuses blocks without an editor and unknown policies', () => {
    expect(editorKeySchema.safeParse('home_steps').success).toBe(false);
    expect(editorKeySchema.safeParse('policy_cookies').success).toBe(false);
    expect(editorKeySchema.safeParse('').success).toBe(false);
  });

  it('routes policy keys to the policy schema', () => {
    expect(schemaForEditorKey('policy_terms')).toBe(policySchema);
  });
});

describe('announcement bar', () => {
  it('takes one announcement per non-blank line', () => {
    const result = validate('announcement_bar', { items: 'Made in Kerala\r\n\n  Eight brands  \n' });
    expect(result).toEqual({ ok: true, data: { items: ['Made in Kerala', 'Eight brands'] } });
  });

  it('refuses an empty bar', () => {
    expect(validate('announcement_bar', { items: '\n \n' })).toEqual({
      ok: false,
      messages: ['Add at least one announcement.'],
    });
  });

  it('names the line that is too long', () => {
    const result = validate('announcement_bar', { items: `Short\n${'x'.repeat(121)}` });
    expect(result).toEqual({
      ok: false,
      messages: ['Announcement 2: Text must be 120 characters or fewer.'],
    });
  });

  it('refuses more than eight', () => {
    const items = Array.from({ length: 9 }, (_, i) => `Line ${i}`).join('\n');
    expect(validate('announcement_bar', { items })).toEqual({
      ok: false,
      messages: ['Eight announcements at most.'],
    });
  });
});

describe('homepage hero link', () => {
  it.each(['/shop', '/', '/brands/mx-3?ref=hero', 'https://bbtcglobal.com/about'])(
    'accepts %s',
    (ctaHref) => {
      expect(validate('home_hero', { ...HERO, ctaHref }).ok).toBe(true);
    },
  );

  it.each([
    'javascript:alert(1)',
    '//evil.example',
    '/\\evil.example',
    'http://bbtcglobal.com',
    'https://',
    'shop',
    '',
  ])('refuses %s', (ctaHref) => {
    const result = validate('home_hero', { ...HERO, ctaHref });
    expect(result.ok).toBe(false);
  });

  it('trims surrounding spaces rather than refusing them', () => {
    const result = validate('home_hero', { ...HERO, ctaHref: '  /shop  ' });
    expect(result.ok && result.data.ctaHref).toBe('/shop');
  });

  it('allows an empty headline start and end but not an empty emphasis', () => {
    expect(validate('home_hero', { ...HERO, before: '', after: '' }).ok).toBe(true);
    expect(validate('home_hero', { ...HERO, emphasis: '  ' })).toEqual({
      ok: false,
      messages: ['Emphasised words is required.'],
    });
  });
});

describe('world record', () => {
  const RECORD = { headline: 'fragrance variants.', body: 'The record.' };

  it('reads the count as a number', () => {
    const result = validate('world_record', { ...RECORD, count: '24' });
    expect(result.ok && result.data.count).toBe(24);
  });

  it.each([
    ['', 'The count must be a whole number.'],
    ['12.5', 'The count must be a whole number.'],
    ['twenty', 'The count must be a whole number.'],
    ['0', 'The count must be above zero.'],
  ])('refuses %j', (count, message) => {
    expect(validate('world_record', { ...RECORD, count })).toEqual({
      ok: false,
      messages: [message],
    });
  });
});

describe('trust badges', () => {
  it('drops unused rows at the end', () => {
    const result = validate('trust_badges', {
      'badgeLabel-0': 'Made in Kerala',
      'badgeDetail-0': 'Palakkad',
      'badgeLabel-1': 'Since 2019',
      'badgeDetail-1': 'Founded by V.K. Faisal',
    });
    expect(result.ok && result.data.badges).toHaveLength(2);
  });

  it('numbers errors the way the editor numbers rows, even past a gap', () => {
    const result = validate('trust_badges', {
      'badgeLabel-0': 'Made in Kerala',
      'badgeDetail-0': 'Palakkad',
      'badgeLabel-2': 'Since 2019',
    });
    expect(result).toEqual({
      ok: false,
      messages: ['Badge 2: Label is required.', 'Badge 2: Detail is required.', 'Badge 3: Detail is required.'],
    });
  });

  it('refuses no badges at all', () => {
    expect(validate('trust_badges', {})).toEqual({ ok: false, messages: ['Add at least one badge.'] });
  });
});

describe('company story', () => {
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(paragraphsOf('First line\nstill first\r\n\r\n\n  Second  ')).toEqual([
      'First line\nstill first',
      'Second',
    ]);
  });

  it('validates heading and paragraphs', () => {
    const result = validate('home_story', { heading: 'One company', paragraphs: 'A.\n\nB.' });
    expect(result).toEqual({ ok: true, data: { heading: 'One company', paragraphs: ['A.', 'B.'] } });
  });
});

describe('policies', () => {
  it('requires a title and text', () => {
    expect(validate('policy_returns', { title: ' ', body: '' })).toEqual({
      ok: false,
      messages: ['Page title is required.', 'Policy text is required.'],
    });
  });

  it('renders # lines as headings and blank-line blocks as paragraphs', () => {
    expect(
      policyBlocks('# Delivery\nWe deliver across Kerala.\r\n\r\nOrders ship in two days.\n\n#\n\n## Returns'),
    ).toEqual([
      { kind: 'heading', text: 'Delivery' },
      { kind: 'paragraph', text: 'We deliver across Kerala.' },
      { kind: 'paragraph', text: 'Orders ship in two days.' },
      { kind: 'heading', text: 'Returns' },
    ]);
  });
});
