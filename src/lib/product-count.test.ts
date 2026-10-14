import { describe, expect, it } from 'vitest';
import { productCountLabel } from './product-count';

describe('productCountLabel', () => {
  it('says coming soon instead of zero', () => {
    expect(productCountLabel(0)).toBe('Products coming soon');
  });

  it('counts products otherwise', () => {
    expect(productCountLabel(1)).toBe('1 product');
    expect(productCountLabel(24)).toBe('24 products');
  });
});
