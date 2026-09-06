import { describe, expect, it } from 'vitest';
import { isVariantSkuConflict, uniqueConflictHints, uniqueConflictModel } from './unique-conflict';

/**
 * The driver-adapter shape below is copied from a real P2002 this project
 * produced (a duplicate SKU in a bulk variant submit against Postgres 16), not
 * invented — that shape is the whole reason this module exists.
 */
const driverAdapterError = {
  code: 'P2002',
  meta: {
    modelName: 'ProductVariant',
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '23505',
        originalMessage: 'duplicate key value violates unique constraint "ProductVariant_sku_key"',
        kind: 'UniqueConstraintViolation',
        constraint: { fields: ['sku'] },
      },
    },
  },
  message: 'Unique constraint failed on the fields: (`sku`)',
};

describe('isVariantSkuConflict', () => {
  it('recognises the driver-adapter shape this project actually produces', () => {
    expect(isVariantSkuConflict(driverAdapterError)).toBe(true);
  });

  it('recognises the classic engine shape, where target is an array of columns', () => {
    expect(isVariantSkuConflict({ meta: { target: ['sku'] } })).toBe(true);
  });

  it('recognises a constraint name given as a plain string', () => {
    expect(isVariantSkuConflict({ meta: { target: 'ProductVariant_sku_key' } })).toBe(true);
  });

  it('falls back to the message when the metadata says nothing useful', () => {
    expect(isVariantSkuConflict({ message: 'Unique constraint failed on the fields: (`sku`)' })).toBe(
      true,
    );
  });

  it('does not mistake a duplicate slug for a duplicate stock code', () => {
    expect(
      isVariantSkuConflict({
        meta: { modelName: 'Product', target: ['slug'] },
        message: 'Unique constraint failed on the fields: (`slug`)',
      }),
    ).toBe(false);
  });

  it('does not mistake the adapter shape of a duplicate slug either', () => {
    expect(
      isVariantSkuConflict({
        meta: {
          modelName: 'Product',
          driverAdapterError: {
            cause: {
              originalMessage: 'duplicate key value violates unique constraint "Product_slug_key"',
              constraint: { fields: ['slug'] },
            },
          },
        },
      }),
    ).toBe(false);
  });

  it('survives an error carrying no metadata at all', () => {
    expect(isVariantSkuConflict({})).toBe(false);
    expect(isVariantSkuConflict({ meta: null })).toBe(false);
    expect(isVariantSkuConflict({ meta: 'unexpected' })).toBe(false);
  });
});

describe('uniqueConflictHints', () => {
  it('gathers column, constraint and message hints, lowercased', () => {
    const hints = uniqueConflictHints(driverAdapterError);
    expect(hints).toContain('sku');
    expect(hints.some((hint) => hint.includes('productvariant_sku_key'))).toBe(true);
  });

  it('is empty for an error with nothing to read', () => {
    expect(uniqueConflictHints({})).toEqual([]);
  });
});

describe('uniqueConflictModel', () => {
  it('reads the model name when present', () => {
    expect(uniqueConflictModel(driverAdapterError)).toBe('ProductVariant');
  });

  it('returns empty when absent', () => {
    expect(uniqueConflictModel({ meta: {} })).toBe('');
  });
});
