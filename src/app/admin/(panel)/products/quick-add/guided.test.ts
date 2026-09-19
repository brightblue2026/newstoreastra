import { describe, expect, it } from 'vitest';
import { parseClaims, parseSteps } from '../format';
import {
  EMPTY_GUIDED_ROW,
  claimsToFieldValue,
  publishChecklist,
  resolveRowSkus,
  segmentDefaults,
  segmentNote,
  slugify,
  stepsToFieldValue,
  suggestRowSku,
  suggestSku,
  type ChecklistInput,
  type GuidedVariantRow,
} from './guided';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('MX Three Dish Wash 500ml')).toBe('mx-three-dish-wash-500ml');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Ilfa Vallëy')).toBe('ilfa-valley');
  });

  it('collapses punctuation and trims stray hyphens', () => {
    expect(slugify('  Kenzaniya — Honey & Spices!  ')).toBe('kenzaniya-honey-spices');
  });

  it('produces the empty string when there is nothing usable', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('suggestSku', () => {
  it('combines brand, product and size so globally-unique SKUs do not collide', () => {
    expect(suggestSku('MX-3', 'Dish Wash Liquid', '500 ml')).toBe('MX3-DISHWASHLIQU-500ML');
  });

  it('distinguishes two brands sharing a product name and size', () => {
    const a = suggestSku('MX-3', 'Dish Wash', '500 ml');
    const b = suggestSku('Rafasi', 'Dish Wash', '500 ml');
    expect(a).not.toBe(b);
  });

  it('returns empty when there is nothing to build from', () => {
    expect(suggestSku('', '', '')).toBe('');
  });
});

describe('claimsToFieldValue', () => {
  it('round-trips through parseClaims with an empty icon', () => {
    const value = claimsToFieldValue(['100% biodegradable', 'Made in Kerala']);
    expect(parseClaims(value)).toEqual([
      { icon: '', label: '100% biodegradable' },
      { icon: '', label: 'Made in Kerala' },
    ]);
  });

  it('drops blank claims', () => {
    expect(parseClaims(claimsToFieldValue(['', '   ', 'Real claim']))).toEqual([
      { icon: '', label: 'Real claim' },
    ]);
  });

  // A claim containing a pipe survives, but `parseClaims` splits on every pipe,
  // trims each part and rejoins — so spaces around the user's own pipe are lost.
  // That is existing behaviour of the shared parser, which the full form has too;
  // recorded here so a future change to `parseClaims` shows up as a failure.
  it('keeps the text of a claim that itself contains a pipe, minus the spacing', () => {
    expect(parseClaims(claimsToFieldValue(['Safe | gentle']))).toEqual([
      { icon: '', label: 'Safe|gentle' },
    ]);
  });
});

describe('stepsToFieldValue', () => {
  it('round-trips through parseSteps', () => {
    expect(parseSteps(stepsToFieldValue(['Wet the sponge', 'Apply directly']))).toEqual([
      'Wet the sponge',
      'Apply directly',
    ]);
  });

  it('drops blank lines', () => {
    expect(parseSteps(stepsToFieldValue(['Only step', '', '  ']))).toEqual(['Only step']);
  });
});

describe('publishChecklist', () => {
  const complete: ChecklistInput = {
    hasName: true,
    hasBrand: true,
    hasCategory: true,
    hasSummary: true,
    hasDescription: true,
    hasHsn: true,
    variantCount: 1,
    isFoodProduct: false,
    foodLabelComplete: false,
  };

  it('always reports the photo step as outstanding — images are added after saving', () => {
    const photo = publishChecklist(complete).find((item) => item.label.includes('photo'));
    expect(photo?.done).toBe(false);
  });

  it('marks every other item done when the form is complete', () => {
    const others = publishChecklist(complete).filter((item) => !item.label.includes('photo'));
    expect(others.every((item) => item.done)).toBe(true);
  });

  it('flags a missing HSN code, which the publish guard requires', () => {
    const hsn = publishChecklist({ ...complete, hasHsn: false }).find((i) =>
      i.label.includes('HSN'),
    );
    expect(hsn?.done).toBe(false);
  });

  it('flags zero sizes, which the publish guard requires', () => {
    const size = publishChecklist({ ...complete, variantCount: 0 }).find((i) =>
      i.label.includes('size'),
    );
    expect(size?.done).toBe(false);
  });

  it('adds the FSSAI row only for food products', () => {
    const nonFood = publishChecklist(complete);
    expect(nonFood.some((i) => i.label.includes('FSSAI'))).toBe(false);

    const food = publishChecklist({ ...complete, isFoodProduct: true, foodLabelComplete: false });
    expect(food.find((i) => i.label.includes('FSSAI'))?.done).toBe(false);
  });
});

describe('suggestRowSku', () => {
  it('separates two fragrances sharing one size', () => {
    const lemon = suggestRowSku('MX-3', 'Dish Wash', 'Lemon', '500 ml');
    const jasmin = suggestRowSku('MX-3', 'Dish Wash', 'Jasmin', '500 ml');
    expect(lemon).not.toBe(jasmin);
  });

  it('falls back to size alone when there is no fragrance name', () => {
    expect(suggestRowSku('MX-3', 'Dish Wash', '', '500 ml')).toBe(
      suggestSku('MX-3', 'Dish Wash', '500 ml'),
    );
  });
});

describe('resolveRowSkus', () => {
  function row(patch: Partial<GuidedVariantRow>): GuidedVariantRow {
    return { ...EMPTY_GUIDED_ROW, ...patch };
  }

  it('generates a distinct code per row', () => {
    const skus = resolveRowSkus(
      [row({ size: '500 ml' }), row({ size: '900 ml' }), row({ size: '5 L' })],
      'MX-3',
      'Dish Wash',
    );
    expect(new Set(skus).size).toBe(3);
    expect(skus.every((sku) => sku !== '')).toBe(true);
  });

  it('suffixes rather than repeating when two rows would generate the same code', () => {
    const skus = resolveRowSkus([row({ size: '500 ml' }), row({ size: '500ml' })], 'MX-3', 'Dish');
    expect(skus[1]).toBe(`${skus[0]}-2`);
  });

  it('leaves a code the user typed exactly as typed', () => {
    const skus = resolveRowSkus([row({ size: '500 ml', skuOverride: ' MX3-LEMON ' })], 'MX-3', 'Dish');
    expect(skus[0]).toBe('MX3-LEMON');
  });

  it('repeats a typed code rather than renaming it, leaving the server to object', () => {
    const skus = resolveRowSkus(
      [row({ size: '500 ml', skuOverride: 'SAME' }), row({ size: '900 ml', skuOverride: 'SAME' })],
      'MX-3',
      'Dish',
    );
    expect(skus).toEqual(['SAME', 'SAME']);
  });

  it('never lets a generated code collide with a typed one, whatever the row order', () => {
    const typed = suggestRowSku('MX-3', 'Dish', '', '500 ml');
    const skus = resolveRowSkus(
      [row({ size: '500 ml' }), row({ size: '500 ml', skuOverride: typed })],
      'MX-3',
      'Dish',
    );
    expect(skus[0]).not.toBe(skus[1]);
    expect(skus[1]).toBe(typed);
  });

  it('returns empty for a row with nothing to build a code from', () => {
    expect(resolveRowSkus([row({})], '', '')).toEqual(['']);
  });
});

describe('segmentDefaults', () => {
  it('treats food and beverage brands as food products', () => {
    expect(segmentDefaults('FOOD').isFoodProduct).toBe(true);
    expect(segmentDefaults('BEVERAGE').isFoodProduct).toBe(true);
  });

  it('treats personal care as cosmetic', () => {
    expect(segmentDefaults('PERSONAL_CARE')).toEqual({ isFoodProduct: false, isCosmetic: true });
  });

  it('assumes nothing for fragrance — the licence question is still open', () => {
    expect(segmentDefaults('FRAGRANCE')).toEqual({ isFoodProduct: false, isCosmetic: false });
    expect(segmentNote('FRAGRANCE')).not.toBe('');
  });

  it('assumes nothing when no brand is chosen yet', () => {
    expect(segmentDefaults(null)).toEqual({ isFoodProduct: false, isCosmetic: false });
    expect(segmentNote(null)).toBe('');
  });

  it('says nothing extra for a plain cleaning brand', () => {
    expect(segmentDefaults('DISH_CARE')).toEqual({ isFoodProduct: false, isCosmetic: false });
    expect(segmentNote('DISH_CARE')).toBe('');
  });
});
