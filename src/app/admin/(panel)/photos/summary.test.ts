import { describe, expect, it } from 'vitest';
import { emptyMessage, inFilter, matchesSearch, parseFilter, summarise } from './summary';

const image = (publicId: string, variantId: string | null) => ({
  url: `https://cdn.test/${publicId}`,
  alt: publicId,
  publicId,
  variantId,
});

const lemon = summarise({
  id: 'p1',
  name: 'Lemon Fragrant Dish Wash Liquid',
  isActive: true,
  // One picture on two sizes, and a product-wide photo listed after it.
  images: [image('a', 'v1'), image('a', 'v2'), image('b', null)],
  variants: [{ photoCount: 1 }, { photoCount: 1 }, { photoCount: 0 }],
});

const honey = summarise({ id: 'p2', name: 'Jamun Honey', isActive: true, images: [], variants: [{ photoCount: 0 }] });
const draft = summarise({ id: 'p3', name: 'Rose Soap', isActive: false, images: [], variants: [] });

describe('summarise', () => {
  it('counts pictures, not rows, and prefers a product-wide cover', () => {
    expect(lemon.pictures).toBe(2);
    expect(lemon.cover?.url).toBe('https://cdn.test/b');
    expect(lemon.variantsWithPhoto).toBe(2);
    expect(lemon.variants).toBe(3);
  });

  it('has no cover without photos', () => {
    expect(honey.cover).toBeNull();
    expect(honey.pictures).toBe(0);
  });
});

describe('filters', () => {
  it('finds products with no photo, and those already on the store', () => {
    expect([lemon, honey, draft].filter((p) => inFilter(p, 'none')).map((p) => p.id)).toEqual(['p2', 'p3']);
    expect([lemon, honey, draft].filter((p) => inFilter(p, 'live-none')).map((p) => p.id)).toEqual(['p2']);
  });

  it('finds products with a variant still missing its photo', () => {
    expect([lemon, honey, draft].filter((p) => inFilter(p, 'variants')).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('falls back to all for an unknown filter', () => {
    expect(parseFilter('nonsense')).toBe('all');
    expect(parseFilter('live-none')).toBe('live-none');
  });
});

describe('matchesSearch', () => {
  it('matches every word, in any case', () => {
    expect(matchesSearch(lemon, 'lemon DISH')).toBe(true);
    expect(matchesSearch(lemon, 'lemon honey')).toBe(false);
    expect(matchesSearch(lemon, '  ')).toBe(true);
  });
});

describe('emptyMessage', () => {
  it('reads as good news for a clean filter', () => {
    expect(emptyMessage('live-none', false)).toBe('Every product on the store has a photo.');
    expect(emptyMessage('none', true)).toBe('No product matches that search.');
  });
});
