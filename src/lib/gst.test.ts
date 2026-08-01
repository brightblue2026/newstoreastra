import { describe, expect, it } from 'vitest';
import {
  GstError,
  PLACE_OF_SUPPLY_STATE,
  buildTaxByHsn,
  formatRate,
  isIntraStateSupply,
  resolveState,
  splitInclusive,
  stateCode,
  taxOnInclusive,
  type TaxableLine,
} from './gst';

// Rates used across the catalogue. Indicative only — every one of these needs
// the accountant's confirmation against the current CBIC schedule (brief §10).
const DETERGENT = 1800; // MX-3, Rafasi, Landfloro, ANSAF
const GHEE = 1200; // Kenzaniya Premium Ghee
const SPICE = 500; // Kerala Spices
const JAGGERY = 0; // Marayoor Sharkara, exempt

describe('the Phase 0 acceptance criterion', () => {
  const price = 14900; // ₹149.00 inclusive, 18%

  it('splits a Kerala delivery into CGST + SGST with no IGST', () => {
    const tax = taxOnInclusive(price, DETERGENT, isIntraStateSupply('Kerala'));
    expect(tax.igstPaise).toBe(0);
    expect(tax.cgstPaise + tax.sgstPaise).toBe(tax.taxPaise);
    expect(tax.cgstPaise).toBeGreaterThan(0);
    expect(tax.sgstPaise).toBeGreaterThan(0);
  });

  it('charges a Tamil Nadu delivery IGST with no CGST or SGST', () => {
    const tax = taxOnInclusive(price, DETERGENT, isIntraStateSupply('Tamil Nadu'));
    expect(tax.cgstPaise).toBe(0);
    expect(tax.sgstPaise).toBe(0);
    expect(tax.igstPaise).toBe(tax.taxPaise);
  });

  it('collects exactly the same total either way', () => {
    const kerala = taxOnInclusive(price, DETERGENT, true);
    const tamilNadu = taxOnInclusive(price, DETERGENT, false);
    expect(kerala.cgstPaise + kerala.sgstPaise).toBe(tamilNadu.igstPaise);
    expect(kerala.taxablePaise).toBe(tamilNadu.taxablePaise);
  });
});

describe('splitInclusive', () => {
  it('back-calculates tax out of a GST-inclusive price', () => {
    // ₹149.00 at 18% → taxable ₹126.27, tax ₹22.73
    const { taxablePaise, taxPaise } = splitInclusive(14900, DETERGENT);
    expect(taxablePaise).toBe(12627);
    expect(taxPaise).toBe(2273);
  });

  it('always reconciles: taxable + tax is exactly the amount charged', () => {
    for (const rate of [0, 500, 1200, 1800, 2800]) {
      for (const amount of [1, 99, 7000, 11800, 14900, 24000, 32000, 123457]) {
        const split = splitInclusive(amount, rate);
        expect(split.taxablePaise + split.taxPaise).toBe(amount);
        expect(Number.isInteger(split.taxablePaise)).toBe(true);
        expect(Number.isInteger(split.taxPaise)).toBe(true);
        expect(split.taxPaise).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('leaves a nil-rated item untaxed', () => {
    const split = splitInclusive(25000, JAGGERY);
    expect(split.taxablePaise).toBe(25000);
    expect(split.taxPaise).toBe(0);
  });

  it('handles zero', () => {
    expect(splitInclusive(0, DETERGENT)).toEqual({
      inclusivePaise: 0,
      taxablePaise: 0,
      taxPaise: 0,
    });
  });

  it('rejects a rate given as a percentage rather than basis points', () => {
    // 18 would be 0.18%, almost certainly a bug at the call site.
    expect(() => splitInclusive(14900, 10_001)).toThrow(GstError);
    expect(() => splitInclusive(14900, -1)).toThrow(GstError);
    expect(() => splitInclusive(14900, 18.5)).toThrow(GstError);
  });
});

describe('taxOnInclusive', () => {
  it('gives the odd paise to SGST so the two halves always sum to the tax', () => {
    // Any amount whose tax is odd would drift if the rate were halved instead.
    for (let amount = 1; amount <= 2000; amount++) {
      const intra = taxOnInclusive(amount, DETERGENT, true);
      const inter = taxOnInclusive(amount, DETERGENT, false);
      expect(intra.cgstPaise + intra.sgstPaise).toBe(intra.taxPaise);
      expect(intra.cgstPaise + intra.sgstPaise).toBe(inter.igstPaise);
      expect(intra.sgstPaise - intra.cgstPaise).toBeLessThanOrEqual(1);
    }
  });

  it('returns integers throughout', () => {
    const tax = taxOnInclusive(11800, DETERGENT, true);
    for (const value of [
      tax.taxablePaise,
      tax.taxPaise,
      tax.cgstPaise,
      tax.sgstPaise,
      tax.igstPaise,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('place of supply', () => {
  it('treats Kerala as the place of supply', () => {
    expect(PLACE_OF_SUPPLY_STATE).toBe('Kerala');
    expect(isIntraStateSupply('Kerala')).toBe(true);
  });

  it('recognises case, spacing, abbreviations, codes and a common misspelling', () => {
    for (const input of ['kerala', 'KERALA', '  Kerala  ', 'KL', 'kl', '32', 'Kerela']) {
      expect(isIntraStateSupply(input)).toBe(true);
    }
  });

  it('treats every other state as inter-state', () => {
    for (const input of ['Tamil Nadu', 'TN', 'Karnataka', '29', 'Maharashtra', 'Delhi']) {
      expect(isIntraStateSupply(input)).toBe(false);
    }
  });

  it('treats a missing or unrecognised state as inter-state', () => {
    // IGST at the full rate collects the same total, so nobody is undercharged.
    expect(isIntraStateSupply(null)).toBe(false);
    expect(isIntraStateSupply(undefined)).toBe(false);
    expect(isIntraStateSupply('')).toBe(false);
    expect(isIntraStateSupply('Atlantis')).toBe(false);
  });

  it('resolves states to a canonical name and GST code', () => {
    expect(resolveState('tn')).toBe('Tamil Nadu');
    expect(resolveState('Atlantis')).toBeNull();
    expect(stateCode('Kerala')).toBe('32');
    expect(stateCode('Tamil Nadu')).toBe('33');
    expect(stateCode('Atlantis')).toBeNull();
  });
});

describe('buildTaxByHsn — the mixed-rate cart', () => {
  // The normal case for this catalogue: a detergent, a ghee and a jaggery in
  // one order, at three different rates.
  const mixedCart: TaxableLine[] = [
    { hsnCode: '3402', gstRate: DETERGENT, inclusivePaise: 24000 }, // MX-3 1 L
    { hsnCode: '0405', gstRate: GHEE, inclusivePaise: 65000 }, // Premium Ghee
    { hsnCode: '1701', gstRate: JAGGERY, inclusivePaise: 18000 }, // Marayoor Sharkara
  ];

  it('produces one row per rate, not a single blended rate', () => {
    const result = buildTaxByHsn(mixedCart, 'Kerala');
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((r) => r.hsn).sort()).toEqual(['0405', '1701', '3402']);
  });

  it('taxes each HSN group at its own rate', () => {
    const result = buildTaxByHsn(mixedCart, 'Kerala');
    const byHsn = Object.fromEntries(result.rows.map((r) => [r.hsn, r]));

    expect(byHsn['3402'].rate).toBe(DETERGENT);
    expect(byHsn['0405'].rate).toBe(GHEE);
    expect(byHsn['1701'].rate).toBe(JAGGERY);
    expect(byHsn['1701'].taxPaise).toBe(0);
    expect(byHsn['1701'].taxablePaise).toBe(18000);
  });

  it('reconciles: every row, and the whole order, sums back to what was charged', () => {
    const result = buildTaxByHsn(mixedCart, 'Kerala');
    for (const row of result.rows) {
      expect(row.taxablePaise + row.taxPaise).toBe(row.inclusivePaise);
      expect(row.cgstPaise + row.sgstPaise + row.igstPaise).toBe(row.taxPaise);
    }
    expect(result.taxablePaise + result.taxPaise).toBe(result.inclusivePaise);
    expect(result.inclusivePaise).toBe(24000 + 65000 + 18000);
  });

  it('splits into CGST + SGST for Kerala', () => {
    const result = buildTaxByHsn(mixedCart, 'Kerala');
    expect(result.intraState).toBe(true);
    expect(result.igstPaise).toBe(0);
    expect(result.cgstPaise + result.sgstPaise).toBe(result.taxPaise);
  });

  it('charges IGST for Tamil Nadu, for the same total tax', () => {
    const kerala = buildTaxByHsn(mixedCart, 'Kerala');
    const tamilNadu = buildTaxByHsn(mixedCart, 'Tamil Nadu');

    expect(tamilNadu.intraState).toBe(false);
    expect(tamilNadu.cgstPaise).toBe(0);
    expect(tamilNadu.sgstPaise).toBe(0);
    expect(tamilNadu.igstPaise).toBe(tamilNadu.taxPaise);
    expect(tamilNadu.taxPaise).toBe(kerala.taxPaise);
    expect(tamilNadu.taxablePaise).toBe(kerala.taxablePaise);
  });

  it('merges lines that share an HSN and rate into one invoice row', () => {
    const twoSpices: TaxableLine[] = [
      { hsnCode: '0908', gstRate: SPICE, inclusivePaise: 15000 }, // Cardamom
      { hsnCode: '0908', gstRate: SPICE, inclusivePaise: 25000 }, // Black Pepper
    ];
    const result = buildTaxByHsn(twoSpices, 'Kerala');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].inclusivePaise).toBe(40000);
  });

  it('keeps the same HSN separate when it was sold at different rates', () => {
    // Turmeric powder differs from fresh — same chapter, different rate.
    const result = buildTaxByHsn(
      [
        { hsnCode: '0910', gstRate: SPICE, inclusivePaise: 10000 },
        { hsnCode: '0910', gstRate: 0, inclusivePaise: 10000 },
      ],
      'Kerala',
    );
    expect(result.rows).toHaveLength(2);
  });

  it('orders rows by value, largest first', () => {
    const result = buildTaxByHsn(mixedCart, 'Kerala');
    const values = result.rows.map((r) => r.inclusivePaise);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('returns zeros for an empty cart without throwing', () => {
    const result = buildTaxByHsn([], 'Kerala');
    expect(result.rows).toEqual([]);
    expect(result.taxPaise).toBe(0);
    expect(result.taxablePaise).toBe(0);
    expect(result.inclusivePaise).toBe(0);
  });

  it('refuses a line with no HSN — a product cannot be published without one', () => {
    expect(() =>
      buildTaxByHsn([{ hsnCode: '  ', gstRate: DETERGENT, inclusivePaise: 100 }], 'Kerala'),
    ).toThrow(GstError);
  });

  it('returns integers for every value it reports', () => {
    const result = buildTaxByHsn(mixedCart, 'Kerala');
    for (const value of [
      result.taxablePaise,
      result.cgstPaise,
      result.sgstPaise,
      result.igstPaise,
      result.taxPaise,
      result.inclusivePaise,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    for (const row of result.rows) {
      for (const value of [
        row.taxablePaise,
        row.cgstPaise,
        row.sgstPaise,
        row.igstPaise,
        row.taxPaise,
        row.inclusivePaise,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });
});

describe('formatRate', () => {
  it('renders basis points as a percentage for the invoice', () => {
    expect(formatRate(1800)).toBe('18%');
    expect(formatRate(500)).toBe('5%');
    expect(formatRate(1200)).toBe('12%');
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(125)).toBe('1.25%');
  });
});
