import { describe, expect, it } from 'vitest';
import { parseClaims, parseSteps } from '../format';
import {
  claimsToFieldValue,
  publishChecklist,
  slugify,
  stepsToFieldValue,
  suggestSku,
  type ChecklistInput,
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
