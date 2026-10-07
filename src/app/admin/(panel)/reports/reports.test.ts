import { describe, expect, it } from 'vitest';
import {
  type ReportOrder,
  bestSellers,
  discountPerformance,
  isSale,
  paymentSplit,
  readRange,
  readState,
  since,
  stateSplit,
  summariseSales,
} from './reports';

function order(patch: Partial<ReportOrder> = {}): ReportOrder {
  return {
    status: 'DELIVERED',
    paymentMethod: 'RAZORPAY',
    subtotalPaise: 100_00,
    discountPaise: 0,
    shippingPaise: 0,
    codFeePaise: 0,
    totalPaise: 100_00,
    shippingAddress: { state: 'Kerala' },
    appliedDiscounts: [],
    createdAt: new Date('2026-09-01T10:00:00Z'),
    ...patch,
  };
}

describe('isSale', () => {
  it('counts orders that were paid for and not reversed', () => {
    for (const status of ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED']) {
      expect(isSale({ status })).toBe(true);
    }
  });

  it('excludes money that never arrived or went back', () => {
    for (const status of ['PENDING_PAYMENT', 'CANCELLED', 'RETURNED', 'REFUNDED']) {
      expect(isSale({ status })).toBe(false);
    }
  });
});

describe('summariseSales', () => {
  it('adds up only the real sales', () => {
    const summary = summariseSales([
      order({ totalPaise: 100_00 }),
      order({ totalPaise: 250_00 }),
      order({ status: 'CANCELLED', totalPaise: 999_00 }),
      order({ status: 'PENDING_PAYMENT', totalPaise: 999_00 }),
      order({ status: 'REFUNDED', totalPaise: 999_00 }),
    ]);
    expect(summary.orderCount).toBe(2);
    expect(summary.revenuePaise).toBe(350_00);
  });

  it('keeps the parts separate from the total', () => {
    const summary = summariseSales([
      order({ subtotalPaise: 500_00, discountPaise: 50_00, shippingPaise: 40_00, codFeePaise: 25_00, totalPaise: 515_00 }),
    ]);
    expect(summary.subtotalPaise).toBe(500_00);
    expect(summary.discountPaise).toBe(50_00);
    expect(summary.shippingPaise).toBe(40_00);
    expect(summary.codFeePaise).toBe(25_00);
  });

  it('averages in whole paise', () => {
    const summary = summariseSales([
      order({ totalPaise: 100_00 }),
      order({ totalPaise: 100_00 }),
      order({ totalPaise: 100_01 }),
    ]);
    expect(Number.isInteger(summary.averageOrderPaise)).toBe(true);
    expect(summary.averageOrderPaise).toBe(10000);
  });

  it('does not divide by zero on an empty period', () => {
    const summary = summariseSales([]);
    expect(summary.orderCount).toBe(0);
    expect(summary.revenuePaise).toBe(0);
    expect(summary.averageOrderPaise).toBe(0);
  });
});

describe('bestSellers', () => {
  const items = [
    { skuSnapshot: 'MX3-LEMON-500', nameSnapshot: 'Dish Wash Lemon 500 ml', quantity: 3, totalPaise: 450_00 },
    { skuSnapshot: 'MX3-LEMON-500', nameSnapshot: 'Dish Wash Lemon 500 ml', quantity: 2, totalPaise: 300_00 },
    { skuSnapshot: 'MX3-JASMIN-500', nameSnapshot: 'Dish Wash Jasmin 500 ml', quantity: 4, totalPaise: 600_00 },
  ];

  it('adds the same SKU across orders', () => {
    const top = bestSellers(items);
    // Lemon sold 3 + 2 across two orders, so it outsells Jasmin's single 4.
    expect(top[0]).toMatchObject({ sku: 'MX3-LEMON-500', quantity: 5, revenuePaise: 750_00 });
    expect(top[1]).toMatchObject({ sku: 'MX3-JASMIN-500', quantity: 4 });
  });

  it('ranks by units, not by rupees', () => {
    const top = bestSellers([
      { skuSnapshot: 'CHEAP', nameSnapshot: 'Cheap', quantity: 100, totalPaise: 100_00 },
      { skuSnapshot: 'DEAR', nameSnapshot: 'Dear', quantity: 2, totalPaise: 5000_00 },
    ]);
    expect(top[0].sku).toBe('CHEAP');
  });

  it('honours the limit', () => {
    expect(bestSellers(items, 1)).toHaveLength(1);
  });

  it('is stable when two SKUs tie exactly', () => {
    const tied = [
      { skuSnapshot: 'BBB', nameSnapshot: 'B', quantity: 5, totalPaise: 100 },
      { skuSnapshot: 'AAA', nameSnapshot: 'A', quantity: 5, totalPaise: 100 },
    ];
    expect(bestSellers(tied).map((s) => s.sku)).toEqual(['AAA', 'BBB']);
    expect(bestSellers([...tied].reverse()).map((s) => s.sku)).toEqual(['AAA', 'BBB']);
  });

  it('returns nothing for a period with no sales', () => {
    expect(bestSellers([])).toEqual([]);
  });
});

describe('paymentSplit', () => {
  it('separates cash on delivery from prepaid, with shares in basis points', () => {
    const split = paymentSplit([
      order({ paymentMethod: 'COD', totalPaise: 100_00 }),
      order({ paymentMethod: 'COD', totalPaise: 100_00 }),
      order({ paymentMethod: 'COD', totalPaise: 100_00 }),
      order({ paymentMethod: 'RAZORPAY', totalPaise: 100_00 }),
    ]);
    expect(split[0]).toMatchObject({ label: 'Cash on delivery', orderCount: 3, shareBps: 7500 });
    expect(split[1]).toMatchObject({ label: 'Paid online', orderCount: 1, shareBps: 2500 });
  });

  it('ignores unpaid and cancelled orders', () => {
    const split = paymentSplit([order({ status: 'PENDING_PAYMENT' }), order({ status: 'CANCELLED' })]);
    expect(split).toEqual([]);
  });
});

describe('readState', () => {
  it('reads the snapshot', () => {
    expect(readState({ state: 'Kerala' })).toBe('Kerala');
    expect(readState({ state: '  Tamil Nadu  ' })).toBe('Tamil Nadu');
  });

  it('buckets anything unreadable rather than dropping the order', () => {
    expect(readState(null)).toBe('Unknown');
    expect(readState('Kerala')).toBe('Unknown');
    expect(readState({})).toBe('Unknown');
    expect(readState({ state: '' })).toBe('Unknown');
    expect(readState({ state: 42 })).toBe('Unknown');
  });
});

describe('stateSplit', () => {
  it('groups by delivery state, biggest first', () => {
    const split = stateSplit([
      order({ shippingAddress: { state: 'Kerala' } }),
      order({ shippingAddress: { state: 'Kerala' } }),
      order({ shippingAddress: { state: 'Karnataka' } }),
    ]);
    expect(split.map((s) => s.label)).toEqual(['Kerala', 'Karnataka']);
    expect(split[0].orderCount).toBe(2);
  });

  it('always adds up to the number of sales', () => {
    const orders = [
      order({ shippingAddress: { state: 'Kerala' } }),
      order({ shippingAddress: null }),
      order({ shippingAddress: { nothing: true } }),
    ];
    const split = stateSplit(orders);
    expect(split.reduce((total, row) => total + row.orderCount, 0)).toBe(3);
  });
});

describe('discountPerformance', () => {
  it('totals what each coupon gave away', () => {
    const rows = discountPerformance([
      order({ appliedDiscounts: [{ code: 'ONAM10', type: 'PERCENTAGE', amountPaise: 50_00 }] }),
      order({ appliedDiscounts: [{ code: 'ONAM10', type: 'PERCENTAGE', amountPaise: 30_00 }] }),
    ]);
    expect(rows[0]).toMatchObject({ label: 'ONAM10', orderCount: 2, givenPaise: 80_00 });
  });

  it('labels an automatic offer by its type rather than "no code"', () => {
    const rows = discountPerformance([
      order({ appliedDiscounts: [{ code: null, type: 'FREE_SHIPPING', amountPaise: 40_00 }] }),
    ]);
    expect(rows[0].label).toBe('Automatic — free shipping');
  });

  it('counts an order once even when the same offer appears twice on it', () => {
    const rows = discountPerformance([
      order({
        appliedDiscounts: [
          { code: 'ONAM10', type: 'PERCENTAGE', amountPaise: 10_00 },
          { code: 'ONAM10', type: 'PERCENTAGE', amountPaise: 15_00 },
        ],
      }),
    ]);
    expect(rows[0].orderCount).toBe(1);
    expect(rows[0].givenPaise).toBe(25_00);
  });

  it('ignores orders that were never paid for', () => {
    expect(
      discountPerformance([
        order({ status: 'CANCELLED', appliedDiscounts: [{ code: 'X', type: 'PERCENTAGE', amountPaise: 99_00 }] }),
      ]),
    ).toEqual([]);
  });

  it('survives a snapshot that is not the shape it should be', () => {
    expect(
      discountPerformance([
        order({ appliedDiscounts: 'not an array' }),
        order({ appliedDiscounts: [null, 7, { amountPaise: 'lots' }] }),
      ]),
    ).toEqual([{ label: 'Automatic — offer', orderCount: 1, givenPaise: 0 }]);
  });
});

describe('readRange', () => {
  it('accepts the ranges the screen offers', () => {
    expect(readRange('7')).toBe(7);
    expect(readRange('365')).toBe(365);
  });

  it('falls back to 30 days for anything else', () => {
    expect(readRange(undefined)).toBe(30);
    expect(readRange('9999')).toBe(30);
    expect(readRange('; DROP TABLE')).toBe(30);
  });
});

describe('since', () => {
  it('counts back from now', () => {
    const from = since(30, new Date('2026-09-18T00:00:00Z'));
    expect(from.toISOString().slice(0, 10)).toBe('2026-08-19');
  });
});
