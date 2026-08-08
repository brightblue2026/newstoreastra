import { describe, expect, it } from 'vitest';
import { cartLineKey, normaliseChoices } from './cart-line';

describe('normaliseChoices', () => {
  it('returns undefined for nothing to normalise', () => {
    expect(normaliseChoices(undefined)).toBeUndefined();
    expect(normaliseChoices(null)).toBeUndefined();
    expect(normaliseChoices([])).toBeUndefined();
  });

  it('drops slots with no picks, and returns undefined if that empties it', () => {
    expect(normaliseChoices([{ itemId: 'i1', variantIds: [] }])).toBeUndefined();
    expect(
      normaliseChoices([
        { itemId: 'i1', variantIds: [] },
        { itemId: 'i2', variantIds: ['v1'] },
      ]),
    ).toEqual([{ itemId: 'i2', variantIds: ['v1'] }]);
  });

  it('sorts slots and the picks within them', () => {
    expect(
      normaliseChoices([
        { itemId: 'i2', variantIds: ['vc', 'va'] },
        { itemId: 'i1', variantIds: ['vb'] },
      ]),
    ).toEqual([
      { itemId: 'i1', variantIds: ['vb'] },
      { itemId: 'i2', variantIds: ['va', 'vc'] },
    ]);
  });

  it('keeps repeats — three bottles of the same fragrance is a real pick', () => {
    expect(normaliseChoices([{ itemId: 'i1', variantIds: ['v1', 'v1', 'v1'] }])).toEqual([
      { itemId: 'i1', variantIds: ['v1', 'v1', 'v1'] },
    ]);
  });

  it('does not mutate its input', () => {
    const input = [{ itemId: 'i1', variantIds: ['vc', 'va'] }];
    normaliseChoices(input);
    expect(input[0].variantIds).toEqual(['vc', 'va']);
  });
});

describe('cartLineKey', () => {
  it('keys a variant by kind and id', () => {
    expect(cartLineKey({ kind: 'VARIANT', id: 'v1' })).toBe('VARIANT:v1');
  });

  it('keys a combo with no choices exactly as a pre-choices cart did', () => {
    expect(cartLineKey({ kind: 'COMBO', id: 'c1' })).toBe('COMBO:c1');
    expect(cartLineKey({ kind: 'COMBO', id: 'c1', choices: [] })).toBe('COMBO:c1');
  });

  it('ignores choices on a variant line', () => {
    expect(
      cartLineKey({ kind: 'VARIANT', id: 'v1', choices: [{ itemId: 'i1', variantIds: ['v9'] }] }),
    ).toBe('VARIANT:v1');
  });

  it('gives the same key however the customer clicked', () => {
    const a = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [
        { itemId: 'i2', variantIds: ['vRose', 'vLemon'] },
        { itemId: 'i1', variantIds: ['vJasmin'] },
      ],
    });
    const b = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [
        { itemId: 'i1', variantIds: ['vJasmin'] },
        { itemId: 'i2', variantIds: ['vLemon', 'vRose'] },
      ],
    });
    expect(a).toBe(b);
  });

  it('separates two lines of the same combo with different fragrances', () => {
    const lemon = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [{ itemId: 'i1', variantIds: ['vLemon'] }],
    });
    const rose = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [{ itemId: 'i1', variantIds: ['vRose'] }],
    });
    expect(lemon).not.toBe(rose);
  });

  it('separates two lemons from one lemon and one rose', () => {
    const twoLemons = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [{ itemId: 'i1', variantIds: ['vLemon', 'vLemon'] }],
    });
    const mixed = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [{ itemId: 'i1', variantIds: ['vLemon', 'vRose'] }],
    });
    expect(twoLemons).not.toBe(mixed);
  });

  it('cannot be confused by ids that share a prefix', () => {
    const a = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [{ itemId: 'i1', variantIds: ['v1', 'v2'] }],
    });
    const b = cartLineKey({
      kind: 'COMBO',
      id: 'c1',
      choices: [
        { itemId: 'i1', variantIds: ['v1'] },
        { itemId: 'v2', variantIds: ['v3'] },
      ],
    });
    expect(a).not.toBe(b);
  });
});
