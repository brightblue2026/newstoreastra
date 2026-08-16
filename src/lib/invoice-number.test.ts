import { describe, expect, it } from 'vitest';
import {
  InvoiceNumberError,
  MAX_INVOICE_NUMBER_LENGTH,
  formatInvoiceNumber,
  invoiceNumberPrefix,
  parseInvoiceNumber,
} from './invoice-number';
import { formatOrderNumber } from './order-number';

describe('formatInvoiceNumber', () => {
  it('formats a sequence into the financial year it falls in', () => {
    expect(formatInvoiceNumber(1, new Date('2026-05-01'))).toBe('BBTC/2627/00001');
    expect(formatInvoiceNumber(42, new Date('2026-05-01'))).toBe('BBTC/2627/00042');
  });

  it('pads to five digits so a lexicographic sort is a numeric one', () => {
    const ascending = [1, 2, 10, 99, 100, 1000, 99999].map((n) =>
      formatInvoiceNumber(n, new Date('2026-05-01')),
    );
    expect([...ascending].sort()).toEqual(ascending);
  });

  it('rolls the series over on 1 April, not 1 January', () => {
    // 31 March 2026 is still FY 2025-26; the next day starts a new series.
    expect(formatInvoiceNumber(500, new Date('2026-03-31'))).toBe('BBTC/2526/00500');
    expect(formatInvoiceNumber(1, new Date('2026-04-01'))).toBe('BBTC/2627/00001');
  });

  it('rejects a sequence that is not a whole number in range', () => {
    const date = new Date('2026-05-01');
    expect(() => formatInvoiceNumber(0, date)).toThrow(InvoiceNumberError);
    expect(() => formatInvoiceNumber(-1, date)).toThrow(InvoiceNumberError);
    expect(() => formatInvoiceNumber(1.5, date)).toThrow(InvoiceNumberError);
    expect(() => formatInvoiceNumber(100_000, date)).toThrow(InvoiceNumberError);
    expect(() => formatInvoiceNumber(Number.NaN, date)).toThrow(InvoiceNumberError);
  });
});

describe('CGST Rule 46(b)', () => {
  /*
    The legal constraint, asserted at the worst case rather than a typical one.
    An invoice number over sixteen characters is rejected by the GSTR-1 return,
    and the whole financial year's series would have to be reissued.
  */
  it('never exceeds sixteen characters, even at the maximum sequence', () => {
    const longest = formatInvoiceNumber(99_999, new Date('2026-05-01'));
    expect(longest).toHaveLength(15);
    expect(longest.length).toBeLessThanOrEqual(MAX_INVOICE_NUMBER_LENGTH);
  });

  it('uses only the characters the rule permits', () => {
    // Letters, digits, hyphen and slash. Nothing else.
    expect(formatInvoiceNumber(99_999, new Date('2026-05-01'))).toMatch(/^[A-Za-z0-9/-]+$/);
  });
});

describe('parseInvoiceNumber', () => {
  it('round-trips every number it formats', () => {
    for (const sequence of [1, 7, 250, 99_999]) {
      const formatted = formatInvoiceNumber(sequence, new Date('2026-05-01'));
      expect(parseInvoiceNumber(formatted)).toEqual({
        financialYearCode: '2627',
        sequence,
      });
    }
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseInvoiceNumber('  BBTC/2627/00001  ')?.sequence).toBe(1);
  });

  it('returns null rather than throwing on anything malformed', () => {
    for (const bad of [
      '',
      'BBTC/2627/1', // unpadded
      'BBTC/2627/000001', // six digits
      'BBTC/267/00001', // three-digit year
      'BBTC-2627-00001', // order-number separators
      'BB/2627/00001', // wrong prefix
      'nonsense',
    ]) {
      expect(parseInvoiceNumber(bad)).toBeNull();
    }
  });

  /*
    The two series must never be mistaken for each other — see the module
    comment. Each parser rejecting the other's format is what makes that true
    mechanically rather than by convention.
  */
  it('does not accept an order number', () => {
    expect(parseInvoiceNumber(formatOrderNumber(1, new Date('2026-05-01')))).toBeNull();
  });
});

describe('invoiceNumberPrefix', () => {
  it('is the literal prefix of a number formatted on the same date', () => {
    const date = new Date('2026-05-01');
    expect(formatInvoiceNumber(1, date).startsWith(invoiceNumberPrefix(date))).toBe(true);
  });

  it('separates one financial year from the next', () => {
    expect(invoiceNumberPrefix(new Date('2026-03-31'))).toBe('BBTC/2526/');
    expect(invoiceNumberPrefix(new Date('2026-04-01'))).toBe('BBTC/2627/');
  });
});
