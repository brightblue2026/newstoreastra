import { describe, expect, it } from 'vitest';
import { joinList, publishBlockers } from './publish-check';

const complete = {
  hsnCode: '3402',
  gstRate: 1800,
  isFoodProduct: false,
  foodLabel: null,
  images: [{}],
  variants: [{ images: [] }],
};

describe('publishBlockers', () => {
  it('passes a product with a variant, a photo and tax details', () => {
    expect(publishBlockers(complete)).toEqual([]);
  });

  it('names everything a bare product is missing', () => {
    expect(
      publishBlockers({ ...complete, hsnCode: null, gstRate: null, images: [], variants: [] }),
    ).toEqual(['at least one variant', 'a photo', 'an HSN code', 'a GST rate']);
  });

  it('accepts a photo on a variant in place of one on the product', () => {
    expect(publishBlockers({ ...complete, images: [], variants: [{ images: [{}] }] })).toEqual([]);
  });

  it('treats a nil GST rate as entered', () => {
    expect(publishBlockers({ ...complete, gstRate: 0 })).toEqual([]);
  });

  it('asks food for a complete label', () => {
    expect(publishBlockers({ ...complete, isFoodProduct: true, foodLabel: { netQty: '500 g' } })).toEqual([
      'a complete food label',
    ]);
  });
});

describe('joinList', () => {
  it('reads as a sentence', () => {
    expect(joinList(['a photo'])).toBe('a photo');
    expect(joinList(['a photo', 'an HSN code'])).toBe('a photo and an HSN code');
    expect(joinList(['a photo', 'an HSN code', 'a GST rate'])).toBe('a photo, an HSN code and a GST rate');
  });
});
