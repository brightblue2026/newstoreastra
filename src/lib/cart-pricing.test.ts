import { describe, expect, it, vi } from 'vitest';

// `resolveCartLines` takes its database client as an argument; these two
// stubs only let the module load outside Next's server runtime.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

const { resolveCartLines } = await import('./cart-pricing');

/*
  A product with no GST rate used to be sold at 0% — `gstRate ?? 0` — so an
  18% detergent published before its rate was entered went out untaxed, with
  an invoice to match (found in the pre-launch pass, 28 September 2026).
  Unset is not nil-rated: jaggery carries an explicit 0.
*/

function variant(gstRate: number | null, hsnCode: string | null = '3402') {
  return {
    id: 'v1',
    productId: 'p1',
    sku: '7860001',
    variantName: 'Lemon',
    size: '500ml',
    weightGrams: 550,
    isActive: true,
    pricePaise: 5200,
    images: [],
    product: {
      name: 'MX-3 Dish Wash',
      slug: 'mx-3',
      isActive: true,
      brandId: 'b1',
      categoryId: 'c1',
      hsnCode,
      gstRate,
      images: [],
    },
  };
}

function clientWith(row: ReturnType<typeof variant>) {
  return {
    productVariant: { findMany: async () => [row] },
    combo: { findMany: async () => [] },
  } as unknown as Parameters<typeof resolveCartLines>[1];
}

const LINE = [{ kind: 'VARIANT' as const, id: 'v1', quantity: 1 }];

describe('resolveCartLines — tax fields', () => {
  it('refuses a product whose GST rate was never set', async () => {
    const cart = await resolveCartLines(LINE, clientWith(variant(null)));
    expect(cart.lines).toHaveLength(0);
    expect(cart.unavailable).toEqual(LINE);
  });

  it('sells a nil-rated product at an explicit 0%', async () => {
    const cart = await resolveCartLines(LINE, clientWith(variant(0, '0402')));
    expect(cart.unavailable).toHaveLength(0);
    expect(cart.lines[0].gstRate).toBe(0);
    expect(cart.snapshots[0].gstRate).toBe(0);
  });

  it('carries the product rate onto the line and the snapshot', async () => {
    const cart = await resolveCartLines(LINE, clientWith(variant(1800)));
    expect(cart.lines[0].gstRate).toBe(1800);
    expect(cart.snapshots[0].gstRate).toBe(1800);
  });

  it('still refuses a product with no HSN code', async () => {
    const cart = await resolveCartLines(LINE, clientWith(variant(1800, null)));
    expect(cart.unavailable).toEqual(LINE);
  });
});
