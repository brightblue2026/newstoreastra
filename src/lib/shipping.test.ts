import { describe, expect, it } from 'vitest';
import {
  isServiceablePincode,
  rateShipping,
  totalWeightGrams,
  type ShippingSettings,
} from './shipping';

const SETTINGS: ShippingSettings = {
  slabs: [
    { uptoGrams: 500, pricePaise: 4_000 },
    { uptoGrams: 1_000, pricePaise: 6_000 },
    { uptoGrams: 5_000, pricePaise: 12_000 },
  ],
  overflowPricePaise: 25_000,
  defaultUnitGrams: 0,
  serviceablePincodePrefixes: [],
  // Phase 6 fields. Nothing in this file uses them — `rateShipping` and
  // `isServiceablePincode` are still the pure slab-table half, and the live
  // Shiprocket rate that reads these is decided in `delivery.ts`.
  originPincode: '',
  shiprocketPickupLocation: '',
  preferLiveRates: false,
  autoPushOrders: false,
};

describe('rateShipping', () => {
  it('charges the narrowest slab that holds the weight', () => {
    expect(rateShipping(SETTINGS, 400).pricePaise).toBe(4_000);
    expect(rateShipping(SETTINGS, 900).pricePaise).toBe(6_000);
    expect(rateShipping(SETTINGS, 4_999).pricePaise).toBe(12_000);
  });

  it('treats the slab bound as inclusive', () => {
    const quote = rateShipping(SETTINGS, 500);
    expect(quote.pricePaise).toBe(4_000);
    expect(quote.slabUptoGrams).toBe(500);
  });

  it('charges the overflow price above every slab', () => {
    const quote = rateShipping(SETTINGS, 6_000);
    expect(quote).toEqual({
      pricePaise: 25_000,
      totalGrams: 6_000,
      slabUptoGrams: null,
      overflow: true,
    });
  });

  it('sorts an out-of-order slab table rather than trusting it', () => {
    const unsorted: ShippingSettings = {
      ...SETTINGS,
      slabs: [
        { uptoGrams: 5_000, pricePaise: 12_000 },
        { uptoGrams: 500, pricePaise: 4_000 },
      ],
    };
    expect(rateShipping(unsorted, 400).pricePaise).toBe(4_000);
  });

  it('charges nothing when no slab table is configured', () => {
    const quote = rateShipping({ ...SETTINGS, slabs: [] }, 9_000);
    expect(quote).toEqual({
      pricePaise: 0,
      totalGrams: 9_000,
      slabUptoGrams: null,
      overflow: false,
    });
  });
});

describe('totalWeightGrams', () => {
  it('multiplies each line by its quantity', () => {
    const grams = totalWeightGrams(
      [
        { quantity: 2, weightGrams: 900 },
        { quantity: 1, weightGrams: 250 },
      ],
      { defaultUnitGrams: 0 },
    );
    expect(grams).toBe(2_050);
  });

  it('counts an unweighed variant as the configured default, not as nothing', () => {
    // Most of the catalogue has no weightGrams yet. Skipping those lines would
    // land a heavy order in the lightest slab.
    expect(totalWeightGrams([{ quantity: 3, weightGrams: null }], { defaultUnitGrams: 500 })).toBe(
      1_500,
    );
    expect(totalWeightGrams([{ quantity: 3, weightGrams: null }], { defaultUnitGrams: 0 })).toBe(0);
  });
});

describe('isServiceablePincode', () => {
  it('matches on a prefix', () => {
    const kerala = { ...SETTINGS, serviceablePincodePrefixes: ['67', '68', '69'] };
    expect(isServiceablePincode(kerala, '682035')).toBe(true);
    expect(isServiceablePincode(kerala, '110001')).toBe(false);
  });

  it('treats an empty list as everywhere, not nowhere', () => {
    expect(isServiceablePincode(SETTINGS, '110001')).toBe(true);
  });
});
