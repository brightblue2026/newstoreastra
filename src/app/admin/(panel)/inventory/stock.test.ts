import { describe, expect, it } from 'vitest';
import {
  MAX_QUANTITY,
  StockInputError,
  type StockRow,
  availableAt,
  isLowAt,
  matchesSearch,
  needsAttention,
  parseQuantity,
  summarise,
} from './stock';

function row(patch: Partial<StockRow> = {}): StockRow {
  return {
    locationId: 'loc1',
    locationName: 'BBTC Machineries',
    quantity: 0,
    reserved: 0,
    lowStockAt: 10,
    ...patch,
  };
}

describe('availableAt', () => {
  it('subtracts what is already promised', () => {
    expect(availableAt({ quantity: 50, reserved: 8 })).toBe(42);
  });

  it('never goes negative when reservations outlive their stock', () => {
    expect(availableAt({ quantity: 2, reserved: 5 })).toBe(0);
  });
});

describe('isLowAt', () => {
  it('measures against available, not what is on the shelf', () => {
    // 100 counted, but 95 of them are spoken for.
    expect(isLowAt(row({ quantity: 100, reserved: 95, lowStockAt: 10 }))).toBe(true);
  });

  it('is low exactly at the threshold, not only below it', () => {
    expect(isLowAt(row({ quantity: 10, lowStockAt: 10 }))).toBe(true);
    expect(isLowAt(row({ quantity: 11, lowStockAt: 10 }))).toBe(false);
  });

  it('treats a zero threshold as "only tell me when it runs out"', () => {
    expect(isLowAt(row({ quantity: 1, lowStockAt: 0 }))).toBe(false);
  });

  // The editor lists every active location and tells the user to leave the ones
  // that do not carry an item at zero. Flagging those was making a variant with
  // 50 bottles at the packing centre report "low" at ten offices.
  it('says nothing about a location that does not carry the item', () => {
    expect(isLowAt(row({ quantity: 0, reserved: 0, lowStockAt: 10 }))).toBe(false);
    expect(isLowAt(row({ quantity: 0, reserved: 0, lowStockAt: 0 }))).toBe(false);
  });

  it('still flags a location holding stock only because it is all reserved', () => {
    expect(isLowAt(row({ quantity: 0, reserved: 3, lowStockAt: 10 }))).toBe(true);
  });
});

describe('summarise', () => {
  it('adds every location up', () => {
    const summary = summarise([
      row({ locationId: 'a', quantity: 30, reserved: 5 }),
      row({ locationId: 'b', quantity: 20, reserved: 2 }),
    ]);
    expect(summary.onHand).toBe(50);
    expect(summary.reserved).toBe(7);
    expect(summary.available).toBe(43);
  });

  it('clamps per location, so one oversold site cannot eat another’s stock', () => {
    const summary = summarise([
      row({ locationId: 'a', quantity: 0, reserved: 10 }),
      row({ locationId: 'b', quantity: 25, reserved: 0 }),
    ]);
    // Not 15 — the 10 oversold at A are A's problem and do not reduce B.
    expect(summary.available).toBe(25);
  });

  it('names only the locations that are actually low', () => {
    const summary = summarise([
      row({ locationId: 'a', locationName: 'Kochi', quantity: 3, lowStockAt: 10 }),
      row({ locationId: 'b', locationName: 'Palakkad', quantity: 80, lowStockAt: 10 }),
    ]);
    expect(summary.lowLocations.map((l) => l.locationName)).toEqual(['Kochi']);
  });

  it('reports a variant with no rows as not stocked, not as empty', () => {
    const summary = summarise([]);
    expect(summary.notStocked).toBe(true);
    expect(summary.outOfStock).toBe(false);
    expect(summary.lowLocations).toEqual([]);
    expect(summary.available).toBe(0);
  });

  it('does not flag the branches that simply do not carry it', () => {
    const summary = summarise([
      row({ locationId: 'a', locationName: 'Packing centre', quantity: 50, lowStockAt: 10 }),
      row({ locationId: 'b', locationName: 'Head office', quantity: 0, lowStockAt: 10 }),
      row({ locationId: 'c', locationName: 'Kasargod office', quantity: 0, lowStockAt: 10 }),
    ]);
    expect(summary.lowLocations).toEqual([]);
    expect(summary.outOfStock).toBe(false);
    expect(summary.available).toBe(50);
  });

  it('calls a counted-but-empty variant out of stock, not never counted', () => {
    const summary = summarise([row({ quantity: 0 }), row({ locationId: 'b', quantity: 0 })]);
    expect(summary.outOfStock).toBe(true);
    expect(summary.notStocked).toBe(false);
    expect(summary.lowLocations).toEqual([]);
  });
});

describe('needsAttention', () => {
  it('flags stock nobody has counted', () => {
    expect(needsAttention(summarise([]))).toBe(true);
  });

  it('flags a low location', () => {
    expect(needsAttention(summarise([row({ quantity: 2 })]))).toBe(true);
  });

  it('flags a variant that is counted everywhere and empty everywhere', () => {
    expect(needsAttention(summarise([row({ quantity: 0 })]))).toBe(true);
  });

  it('leaves a healthy variant alone', () => {
    expect(needsAttention(summarise([row({ quantity: 500 })]))).toBe(false);
  });
});

describe('parseQuantity', () => {
  it('reads a whole number', () => {
    expect(parseQuantity('24')).toBe(24);
    expect(parseQuantity('  0  ')).toBe(0);
  });

  it('refuses blank rather than assuming zero', () => {
    expect(() => parseQuantity('')).toThrow(StockInputError);
    expect(() => parseQuantity('   ')).toThrow(/required/);
  });

  it('refuses decimals, negatives and text', () => {
    expect(() => parseQuantity('1.5')).toThrow(StockInputError);
    expect(() => parseQuantity('-4')).toThrow(StockInputError);
    expect(() => parseQuantity('many')).toThrow(StockInputError);
  });

  it('refuses a number past the typo ceiling', () => {
    expect(() => parseQuantity(String(MAX_QUANTITY + 1))).toThrow(StockInputError);
    expect(parseQuantity(String(MAX_QUANTITY))).toBe(MAX_QUANTITY);
  });

  it('names the field it is complaining about', () => {
    expect(() => parseQuantity('', 'Low stock alert')).toThrow(/Low stock alert/);
  });
});

describe('matchesSearch', () => {
  const variant = {
    sku: 'MX3-DISHWASH-LEMON500ML',
    productName: 'Dish Wash Liquid',
    size: '500 ml',
    variantName: 'Lemon',
  };

  it('matches an empty query', () => {
    expect(matchesSearch(variant, '   ')).toBe(true);
  });

  it('matches on sku, product, size and fragrance, ignoring case', () => {
    expect(matchesSearch(variant, 'lemon')).toBe(true);
    expect(matchesSearch(variant, 'MX3')).toBe(true);
    expect(matchesSearch(variant, 'dish wash')).toBe(true);
    expect(matchesSearch(variant, '500 ml')).toBe(true);
  });

  it('does not match something absent', () => {
    expect(matchesSearch(variant, 'jasmin')).toBe(false);
  });

  it('copes with a variant that has no fragrance name', () => {
    expect(matchesSearch({ ...variant, variantName: null }, 'dish')).toBe(true);
  });
});
