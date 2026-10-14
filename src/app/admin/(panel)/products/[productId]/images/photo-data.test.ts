import { describe, expect, it } from 'vitest';
import { photosIn } from './photo-data';

const row = (id: string, publicId: string, variantId: string | null) => ({
  id,
  url: `https://cdn.test/${publicId}`,
  alt: `Photo ${publicId}`,
  publicId,
  variantId,
});

// "a" is on the product and on two sizes; "b" only on the 900 ml.
const rows = [row('r1', 'a', null), row('r2', 'a', 'v225'), row('r3', 'a', 'v900'), row('r4', 'b', 'v900')];

describe('photosIn', () => {
  it('lists the product-wide photos with every place each is used', () => {
    expect(photosIn(rows, null)).toEqual([
      expect.objectContaining({ id: 'r1', usedFor: { general: true, variantIds: ['v225', 'v900'] } }),
    ]);
  });

  it("lists one variant's photos in the order given", () => {
    expect(photosIn(rows, 'v900').map((photo) => photo.id)).toEqual(['r3', 'r4']);
    expect(photosIn(rows, 'v900')[1].usedFor).toEqual({ general: false, variantIds: ['v900'] });
  });

  it('is empty for a variant with no photo', () => {
    expect(photosIn(rows, 'v450')).toEqual([]);
  });
});
