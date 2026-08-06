import { describe, expect, it } from 'vitest';
import { financialYearCode, formatOrderNumber, OrderNumberError, parseOrderNumber } from './order-number';

describe('financialYearCode', () => {
  it('is the prior FY for a January date', () => {
    expect(financialYearCode(new Date('2026-01-15'))).toBe('2526');
  });

  it('is the prior FY for a March date', () => {
    expect(financialYearCode(new Date('2026-03-31'))).toBe('2526');
  });

  it('rolls over on 1 April', () => {
    expect(financialYearCode(new Date('2026-04-01'))).toBe('2627');
  });

  it('is the current FY for a December date', () => {
    expect(financialYearCode(new Date('2026-12-25'))).toBe('2627');
  });
});

describe('formatOrderNumber', () => {
  it('formats with a zero-padded five-digit sequence', () => {
    expect(formatOrderNumber(1, new Date('2026-05-01'))).toBe('BB-2627-00001');
  });

  it('does not truncate a full five-digit sequence', () => {
    expect(formatOrderNumber(99_999, new Date('2026-05-01'))).toBe('BB-2627-99999');
  });

  it('rejects zero, negative, non-integer and over-range sequences', () => {
    expect(() => formatOrderNumber(0)).toThrow(OrderNumberError);
    expect(() => formatOrderNumber(-1)).toThrow(OrderNumberError);
    expect(() => formatOrderNumber(1.5)).toThrow(OrderNumberError);
    expect(() => formatOrderNumber(100_000)).toThrow(OrderNumberError);
  });
});

describe('parseOrderNumber', () => {
  it('round-trips a formatted number', () => {
    const formatted = formatOrderNumber(42, new Date('2026-05-01'));
    expect(parseOrderNumber(formatted)).toEqual({ financialYearCode: '2627', sequence: 42 });
  });

  it('returns null for anything malformed', () => {
    expect(parseOrderNumber('not-an-order-number')).toBeNull();
    expect(parseOrderNumber('BB-26-00001')).toBeNull();
    expect(parseOrderNumber('BB-2627-1')).toBeNull();
  });
});
