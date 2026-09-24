import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX, completeBox, parcelDimensions, volumetricGrams } from './parcel';

describe('parcelDimensions', () => {
  it('declares the default carton for an empty order', () => {
    expect(parcelDimensions([])).toEqual(DEFAULT_BOX);
  });

  it('uses a single measured box as-is', () => {
    expect(
      parcelDimensions([{ quantity: 1, box: { lengthCm: 10, breadthCm: 8, heightCm: 25 } }]),
    ).toEqual({ lengthCm: 10, breadthCm: 8, heightCm: 25 });
  });

  it('stacks several units on the widest footprint', () => {
    // Three 10 × 10 × 5 boxes: footprint 10 × 10, 1500 cm³ → 15 cm tall.
    expect(
      parcelDimensions([{ quantity: 3, box: { lengthCm: 10, breadthCm: 10, heightCm: 5 } }]),
    ).toEqual({ lengthCm: 10, breadthCm: 10, heightCm: 15 });
  });

  it('never declares a box shorter than its tallest item', () => {
    const box = parcelDimensions([
      { quantity: 1, box: { lengthCm: 30, breadthCm: 30, heightCm: 2 } },
      { quantity: 1, box: { lengthCm: 5, breadthCm: 5, heightCm: 20 } },
    ]);
    expect(box.heightCm).toBe(20);
    expect(box.lengthCm).toBe(30);
  });

  it('counts an unmeasured line as the default carton', () => {
    expect(parcelDimensions([{ quantity: 1, box: { lengthCm: 10 } }])).toEqual(DEFAULT_BOX);
  });

  it('ignores zero-quantity lines', () => {
    expect(
      parcelDimensions([
        { quantity: 0, box: { lengthCm: 99, breadthCm: 99, heightCm: 99 } },
        { quantity: 1, box: { lengthCm: 10, breadthCm: 10, heightCm: 10 } },
      ]),
    ).toEqual({ lengthCm: 10, breadthCm: 10, heightCm: 10 });
  });
});

describe('completeBox', () => {
  it('rejects a box with a missing or non-positive side', () => {
    expect(completeBox({ lengthCm: 1, breadthCm: 1 })).toBeNull();
    expect(completeBox({ lengthCm: 1, breadthCm: 0, heightCm: 1 })).toBeNull();
    expect(completeBox(null)).toBeNull();
  });
});

describe('volumetricGrams', () => {
  it('uses the courier divisor of 5000', () => {
    // 20 × 15 × 15 = 4500 cm³ → 0.9 kg.
    expect(volumetricGrams(DEFAULT_BOX)).toBe(900);
  });
});
