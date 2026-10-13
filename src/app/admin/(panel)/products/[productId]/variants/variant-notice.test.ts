import { describe, expect, it } from 'vitest';
import { VARIANT_NOTICE_KINDS, variantLabel, variantNotice } from './variant-notice';

const live = { label: 'Lemon · 900 ml', productName: 'MX Three', productIsActive: true };
const draft = { ...live, productIsActive: false };

describe('variantLabel', () => {
  it('joins what the variant has', () => {
    expect(variantLabel({ variantName: 'Lemon', format: 'Liquid', size: '900 ml' })).toBe(
      'Lemon · Liquid · 900 ml',
    );
    expect(variantLabel({ variantName: null, format: null, size: '250 g' })).toBe('250 g');
  });
});

describe('variantNotice', () => {
  it('has words for every kind an action can redirect with', () => {
    for (const kind of VARIANT_NOTICE_KINDS) {
      expect(variantNotice(kind, live)).not.toBeNull();
    }
  });

  it('says a published variant of a draft product is not on the store yet', () => {
    expect(variantNotice('published', live)?.text).toContain('on the store now');
    expect(variantNotice('published', draft)?.text).toContain('once "MX Three" itself is published');
  });

  it('marks a refusal as a warning and a change as a success', () => {
    expect(variantNotice('last', live)?.tone).toBe('warning');
    expect(variantNotice('all-last', live)?.tone).toBe('warning');
    expect(variantNotice('unpublished', live)?.tone).toBe('success');
  });

  it('puts nothing on the page for a kind it does not know', () => {
    expect(variantNotice('<script>', live)).toBeNull();
    expect(variantNotice(undefined, live)).toBeNull();
  });

  it('says nothing about one variant when the variant is not found', () => {
    expect(variantNotice('published', { ...live, label: undefined })).toBeNull();
  });
});
