import { describe, expect, it } from 'vitest';
import { parseVariantRowsJson } from './variant-rows';

function row(overrides: Partial<Record<string, string>> = {}) {
  return {
    sku: 'MX3-LEMON-225ML',
    variantName: 'Lemon',
    variantHex: '#F5D742',
    size: '225 ml',
    format: 'Liquid',
    mrpRupees: '52.00',
    priceRupees: '52.00',
    wholesaleRupees: '',
    weightGrams: '250',
    barcode: '7860010',
    ...overrides,
  };
}

describe('parseVariantRowsJson', () => {
  it('returns an empty batch for a missing or blank payload', () => {
    expect(parseVariantRowsJson(null)).toEqual({ rows: [] });
    expect(parseVariantRowsJson(undefined)).toEqual({ rows: [] });
    expect(parseVariantRowsJson('')).toEqual({ rows: [] });
    expect(parseVariantRowsJson('   ')).toEqual({ rows: [] });
  });

  it('degrades malformed JSON to an error rather than throwing', () => {
    expect(parseVariantRowsJson('not json')).toEqual({
      error: 'Variant rows could not be read. Try again.',
    });
  });

  it('drops fully-blank rows without treating them as an error', () => {
    const blank = Object.fromEntries(Object.keys(row()).map((key) => [key, '']));
    expect(parseVariantRowsJson(JSON.stringify([blank, blank]))).toEqual({ rows: [] });
  });

  it('parses a valid batch, converting rupees to paise', () => {
    const result = parseVariantRowsJson(JSON.stringify([row()]));
    expect(result).toEqual({
      rows: [
        {
          sku: 'MX3-LEMON-225ML',
          variantName: 'Lemon',
          variantHex: '#F5D742',
          size: '225 ml',
          format: 'Liquid',
          mrpPaise: 5200,
          pricePaise: 5200,
          wholesalePaise: null,
          weightGrams: 250,
          barcode: '7860010',
        },
      ],
    });
  });

  it('keeps a blank price as null — "Price on request", never 0', () => {
    const result = parseVariantRowsJson(JSON.stringify([row({ priceRupees: '' })]));
    expect(result).toEqual({ rows: [expect.objectContaining({ pricePaise: null })] });
  });

  it('rejects a row missing the required size, naming the row', () => {
    expect(parseVariantRowsJson(JSON.stringify([row(), row({ size: '' })]))).toEqual({
      error: 'Row 2: Size is required.',
    });
  });

  it('rejects a row missing the required SKU', () => {
    expect(parseVariantRowsJson(JSON.stringify([row({ sku: '' })]))).toEqual({
      error: 'Row 1: SKU is required.',
    });
  });

  it('rejects a duplicate SKU within the same batch', () => {
    expect(
      parseVariantRowsJson(JSON.stringify([row(), row({ size: '450 ml' })])),
    ).toEqual({ error: 'Row 2: SKU "MX3-LEMON-225ML" is repeated earlier in this batch.' });
  });

  it('rejects an invalid hex accent colour', () => {
    expect(parseVariantRowsJson(JSON.stringify([row({ variantHex: 'not-a-colour' })]))).toEqual({
      error: 'Row 1: Enter a 6-digit hex colour, e.g. #0F9CD6.',
    });
  });

  it('rejects a malformed price with a row-numbered message', () => {
    expect(parseVariantRowsJson(JSON.stringify([row({ priceRupees: '12.345' })]))).toEqual({
      error:
        'Row 1: Price — "12.345" has more than two decimal places. The smallest amount that can be charged is one paise.',
    });
  });

  it('rejects a non-integer weight', () => {
    expect(parseVariantRowsJson(JSON.stringify([row({ weightGrams: '1.5' })]))).toEqual({
      error: 'Row 1: Weight must be a whole number of grams.',
    });
  });

  it('rejects a batch over the row ceiling', () => {
    const rows = Array.from({ length: 201 }, (_, i) => row({ sku: `SKU-${i}` }));
    expect(parseVariantRowsJson(JSON.stringify(rows))).toEqual({
      error: 'Too many variant rows — 200 is the most this form accepts at once.',
    });
  });

  it('parses several distinct rows in order', () => {
    const result = parseVariantRowsJson(
      JSON.stringify([row({ sku: 'A', size: '225 ml' }), row({ sku: 'B', size: '450 ml' })]),
    );
    expect('rows' in result && result.rows.map((r) => r.sku)).toEqual(['A', 'B']);
  });
});
