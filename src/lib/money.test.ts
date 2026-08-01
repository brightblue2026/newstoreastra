import { describe, expect, it } from 'vitest';
import {
  MAX_PAISE,
  MoneyError,
  PRICE_ON_REQUEST,
  applyBps,
  assertPaise,
  distributeProportionally,
  formatINR,
  formatPrice,
  isPaise,
  isPurchasable,
  paiseToRupeesInput,
  parseRupeesToPaise,
  subtractPaise,
  sumPaise,
} from './money';

describe('the Phase 0 acceptance criterion', () => {
  it('round-trips ₹149.00 as 14900', () => {
    const paise = parseRupeesToPaise('149.00');
    expect(paise).toBe(14900);
    expect(formatINR(paise)).toBe('₹149.00');
    expect(paiseToRupeesInput(paise)).toBe('149.00');
    expect(parseRupeesToPaise(paiseToRupeesInput(paise))).toBe(14900);
  });
});

describe('parseRupeesToPaise', () => {
  it('accepts whole rupees', () => {
    expect(parseRupeesToPaise('149')).toBe(14900);
    expect(parseRupeesToPaise('0')).toBe(0);
  });

  it('accepts one or two decimal places', () => {
    expect(parseRupeesToPaise('149.5')).toBe(14950);
    expect(parseRupeesToPaise('149.05')).toBe(14905);
    expect(parseRupeesToPaise('0.01')).toBe(1);
  });

  it('strips the rupee symbol, commas and whitespace', () => {
    expect(parseRupeesToPaise(' ₹1,49,000.50 ')).toBe(14900050);
  });

  it('accepts a number as well as a string', () => {
    expect(parseRupeesToPaise(70)).toBe(7000);
    expect(parseRupeesToPaise(118.5)).toBe(11850);
  });

  it('rejects more than two decimal places rather than silently rounding', () => {
    expect(() => parseRupeesToPaise('149.555')).toThrow(MoneyError);
    expect(() => parseRupeesToPaise('149.555')).toThrow(/two decimal places/);
  });

  it('rejects junk, negatives and empty input', () => {
    expect(() => parseRupeesToPaise('')).toThrow(MoneyError);
    expect(() => parseRupeesToPaise('   ')).toThrow(MoneyError);
    expect(() => parseRupeesToPaise('abc')).toThrow(MoneyError);
    expect(() => parseRupeesToPaise('-149')).toThrow(MoneyError);
    expect(() => parseRupeesToPaise('12.3.4')).toThrow(MoneyError);
  });

  it('does not drift on amounts that break binary floating point', () => {
    // 149.55 * 100 is 14954.999... in IEEE 754. String parsing sidesteps it.
    expect(parseRupeesToPaise('149.55')).toBe(14955);
    expect(parseRupeesToPaise('0.29')).toBe(29);
    expect(parseRupeesToPaise('8.11')).toBe(811);
    expect(parseRupeesToPaise('1070.29')).toBe(107029);
  });

  it('round-trips every paise value from 0 to 999', () => {
    for (let paise = 0; paise < 1000; paise++) {
      expect(parseRupeesToPaise(paiseToRupeesInput(paise))).toBe(paise);
    }
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping, not thousands', () => {
    expect(formatINR(10_000_000)).toBe('₹1,00,000.00');
    expect(formatINR(100_000)).toBe('₹1,000.00');
    expect(formatINR(1_000_000_00)).toBe('₹10,00,000.00');
  });

  it('always shows two decimals by default, so prices keep a stable width', () => {
    expect(formatINR(7000)).toBe('₹70.00');
    expect(formatINR(11800)).toBe('₹118.00');
    expect(formatINR(32000)).toBe('₹320.00');
  });

  it('can trim whole rupees on request', () => {
    expect(formatINR(14900, { trimWholeRupees: true })).toBe('₹149');
    expect(formatINR(14950, { trimWholeRupees: true })).toBe('₹149.50');
  });

  it('can omit the symbol', () => {
    expect(formatINR(14900, { symbol: false })).toBe('149.00');
  });

  it('renders zero as ₹0.00 when zero is genuinely the amount', () => {
    // A zero *discount* is real. A zero *price* is not — that is formatPrice's job.
    expect(formatINR(0)).toBe('₹0.00');
  });
});

describe('formatPrice', () => {
  it('renders a missing price as "Price on request", never ₹0.00', () => {
    expect(formatPrice(null)).toBe(PRICE_ON_REQUEST);
    expect(formatPrice(undefined)).toBe(PRICE_ON_REQUEST);
    expect(formatPrice(null)).not.toContain('0.00');
  });

  it('renders a real price normally', () => {
    expect(formatPrice(24000)).toBe('₹240.00');
  });
});

describe('isPurchasable', () => {
  it('is false for a variant with no published price', () => {
    expect(isPurchasable(null)).toBe(false);
    expect(isPurchasable(undefined)).toBe(false);
  });

  it('is true for a priced variant, including a genuinely free one', () => {
    expect(isPurchasable(7000)).toBe(true);
    expect(isPurchasable(0)).toBe(true);
  });
});

describe('assertPaise', () => {
  it('rejects floats — money is never a float', () => {
    expect(() => assertPaise(149.5)).toThrow(/whole number of paise/);
  });

  it('rejects negatives, NaN, Infinity and non-numbers', () => {
    expect(() => assertPaise(-1)).toThrow(MoneyError);
    expect(() => assertPaise(Number.NaN)).toThrow(MoneyError);
    expect(() => assertPaise(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => assertPaise('14900')).toThrow(MoneyError);
    expect(() => assertPaise(null)).toThrow(MoneyError);
  });

  it('rejects implausibly large amounts', () => {
    expect(() => assertPaise(MAX_PAISE + 1)).toThrow(/maximum/);
  });

  it('names the field it was given, so the error is actionable', () => {
    expect(() => assertPaise(1.5, 'pricePaise')).toThrow(/pricePaise/);
  });

  it('accepts valid amounts', () => {
    expect(() => assertPaise(0)).not.toThrow();
    expect(() => assertPaise(14900)).not.toThrow();
    expect(isPaise(14900)).toBe(true);
    expect(isPaise(149.5)).toBe(false);
  });
});

describe('arithmetic', () => {
  it('sums amounts', () => {
    expect(sumPaise(7000, 11800, 24000)).toBe(42800);
    expect(sumPaise()).toBe(0);
  });

  it('clamps subtraction at zero — a total is never negative', () => {
    expect(subtractPaise(10000, 3000)).toBe(7000);
    expect(subtractPaise(3000, 10000)).toBe(0);
  });

  it('applies basis points', () => {
    expect(applyBps(200000, 1000)).toBe(20000); // 10% of ₹2,000
    expect(applyBps(14900, 1800)).toBe(2682); // 18% of ₹149
    expect(applyBps(14900, 0)).toBe(0);
  });

  it('returns integers from applyBps even when the maths does not divide', () => {
    const result = applyBps(333, 1800);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('distributeProportionally', () => {
  it('splits exactly, with no paise lost or invented', () => {
    const shares = distributeProportionally(10000, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(shares).toEqual([3334, 3333, 3333]);
  });

  it('gives the rounding remainder to the largest weight', () => {
    const shares = distributeProportionally(100, [70, 30]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares[0]).toBeGreaterThan(shares[1]);
  });

  it('handles a single line', () => {
    expect(distributeProportionally(9999, [42])).toEqual([9999]);
  });

  it('returns an empty array for no lines', () => {
    expect(distributeProportionally(1000, [])).toEqual([]);
  });

  it('spreads evenly when every weight is zero rather than dividing by zero', () => {
    const shares = distributeProportionally(10, [0, 0, 0]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('always returns integers that sum to the total, across many shapes', () => {
    const cases: Array<[number, number[]]> = [
      [1, [1, 1, 1]],
      [7, [3, 5, 11]],
      [99999, [12345, 999, 1]],
      [12345, [1, 1, 1, 1, 1, 1, 1]],
      [50000, [24000, 11800, 7000, 32000]],
    ];
    for (const [total, weights] of cases) {
      const shares = distributeProportionally(total, weights);
      expect(shares.every(Number.isInteger)).toBe(true);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      expect(shares.every((s) => s >= 0)).toBe(true);
    }
  });

  it('rejects negative weights', () => {
    expect(() => distributeProportionally(100, [1, -1])).toThrow(MoneyError);
  });
});
