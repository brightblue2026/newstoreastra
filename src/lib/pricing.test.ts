import { describe, expect, it } from 'vitest';
import { MoneyError } from './money';
import { calculateCart, type CartLine, type DiscountInput } from './pricing';

let nextId = 0;

function makeDiscount(overrides: Partial<DiscountInput> = {}): DiscountInput {
  nextId += 1;
  return {
    id: `discount-${nextId}`,
    code: null,
    type: 'PERCENTAGE',
    scope: 'ORDER',
    valuePaise: null,
    valueBps: null,
    tiers: null,
    buyQty: null,
    getQty: null,
    minOrderPaise: null,
    maxDiscountPaise: null,
    targetIds: [],
    usageLimit: null,
    usageCount: 0,
    perCustomerLimit: null,
    stackable: true,
    priority: 0,
    startsAt: new Date('2020-01-01T00:00:00Z'),
    endsAt: null,
    isActive: true,
    ...overrides,
  };
}

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    kind: 'VARIANT',
    id: 'variant-1',
    quantity: 1,
    unitPricePaise: 10_000,
    hsnCode: '3401',
    gstRate: 1800,
    ...overrides,
  };
}

const NOW = new Date('2026-06-01T00:00:00Z');
const PAYMENT = 'RAZORPAY' as const;

describe('calculateCart', () => {
  it('returns zeros for an empty cart without throwing', () => {
    const result = calculateCart({ lines: [], discounts: [], paymentMethod: PAYMENT, now: NOW });

    expect(result.subtotalPaise).toBe(0);
    expect(result.discountPaise).toBe(0);
    expect(result.shippingPaise).toBe(0);
    expect(result.codFeePaise).toBe(0);
    expect(result.totalPaise).toBe(0);
    expect(result.lines).toEqual([]);
    expect(result.appliedDiscounts).toEqual([]);
  });

  it('refuses a total past MAX_PAISE rather than silently returning a huge order', () => {
    const lines = [makeLine({ unitPricePaise: 999_999_900, quantity: 3 })];

    expect(() =>
      calculateCart({ lines, discounts: [], paymentMethod: PAYMENT, now: NOW }),
    ).toThrow(MoneyError);
  });

  it('caps a 10% discount at ₹100 on a ₹2,000 cart', () => {
    const lines = [makeLine({ unitPricePaise: 200_000, quantity: 1 })];
    const discount = makeDiscount({ type: 'PERCENTAGE', valueBps: 1000, maxDiscountPaise: 10_000 });

    const result = calculateCart({ lines, discounts: [discount], paymentMethod: PAYMENT, now: NOW });

    expect(result.discountPaise).toBe(10_000);
  });

  it('applies only the higher-priority discount when two are non-stackable', () => {
    const lines = [makeLine({ unitPricePaise: 100_000, quantity: 1 })];
    const low = makeDiscount({ type: 'FIXED_AMOUNT', valuePaise: 5_000, stackable: false, priority: 1 });
    const high = makeDiscount({ type: 'FIXED_AMOUNT', valuePaise: 8_000, stackable: false, priority: 2 });

    const result = calculateCart({
      lines,
      discounts: [low, high],
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.appliedDiscounts).toHaveLength(1);
    expect(result.appliedDiscounts[0].discountId).toBe(high.id);
    expect(result.discountPaise).toBe(8_000);
  });

  it('breaks a priority tie in favour of the larger customer saving', () => {
    const lines = [makeLine({ unitPricePaise: 100_000, quantity: 1 })];
    const smaller = makeDiscount({
      type: 'FIXED_AMOUNT',
      valuePaise: 5_000,
      stackable: false,
      priority: 1,
    });
    const larger = makeDiscount({
      type: 'PERCENTAGE',
      valueBps: 1000, // 10% of 100,000 = 10,000
      stackable: false,
      priority: 1,
    });

    const result = calculateCart({
      lines,
      discounts: [smaller, larger],
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.appliedDiscounts).toHaveLength(1);
    expect(result.appliedDiscounts[0].discountId).toBe(larger.id);
    expect(result.discountPaise).toBe(10_000);
  });

  it('excludes a discount just under minOrderPaise and includes it exactly at the threshold', () => {
    const discount = makeDiscount({
      type: 'FIXED_AMOUNT',
      valuePaise: 5_000,
      minOrderPaise: 50_000,
    });

    const under = calculateCart({
      lines: [makeLine({ unitPricePaise: 49_900, quantity: 1 })],
      discounts: [discount],
      paymentMethod: PAYMENT,
      now: NOW,
    });
    expect(under.discountPaise).toBe(0);

    const atThreshold = calculateCart({
      lines: [makeLine({ unitPricePaise: 50_000, quantity: 1 })],
      discounts: [discount],
      paymentMethod: PAYMENT,
      now: NOW,
    });
    expect(atThreshold.discountPaise).toBe(5_000);
  });

  it('picks the correct TIERED_QUANTITY tier at exactly 3 and exactly 6 units', () => {
    const discount = makeDiscount({
      type: 'TIERED_QUANTITY',
      tiers: [
        { minQty: 3, valueBps: 1000 },
        { minQty: 6, valueBps: 1500 },
      ],
    });

    const atThree = calculateCart({
      lines: [makeLine({ unitPricePaise: 10_000, quantity: 3 })],
      discounts: [discount],
      paymentMethod: PAYMENT,
      now: NOW,
    });
    // subtotal 30,000 × 10% = 3,000
    expect(atThree.discountPaise).toBe(3_000);

    const atSix = calculateCart({
      lines: [makeLine({ unitPricePaise: 10_000, quantity: 6 })],
      discounts: [discount],
      paymentMethod: PAYMENT,
      now: NOW,
    });
    // subtotal 60,000 × 15% = 9,000
    expect(atSix.discountPaise).toBe(9_000);
  });

  it('BUY_X_GET_Y discounts the cheapest unit of each group', () => {
    // Buy 2 get 1. Units: two at ₹100 and one at ₹50 → one group of 3, the
    // ₹50 unit is the cheapest and becomes free.
    const discount = makeDiscount({ type: 'BUY_X_GET_Y', buyQty: 2, getQty: 1 });
    const lines = [
      makeLine({ id: 'a', unitPricePaise: 10_000, quantity: 2 }),
      makeLine({ id: 'b', unitPricePaise: 5_000, quantity: 1 }),
    ];

    const result = calculateCart({ lines, discounts: [discount], paymentMethod: PAYMENT, now: NOW });

    expect(result.discountPaise).toBe(5_000);
  });

  it('Kerala delivery splits into CGST + SGST with zero IGST', () => {
    const result = calculateCart({
      lines: [makeLine({ unitPricePaise: 118_000, gstRate: 1800 })],
      discounts: [],
      shippingState: 'Kerala',
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.taxByHsn.igstPaise).toBe(0);
    expect(result.taxByHsn.cgstPaise).toBeGreaterThan(0);
    expect(result.taxByHsn.sgstPaise).toBeGreaterThan(0);
  });

  it('Tamil Nadu delivery is IGST with zero CGST/SGST', () => {
    const result = calculateCart({
      lines: [makeLine({ unitPricePaise: 118_000, gstRate: 1800 })],
      discounts: [],
      shippingState: 'Tamil Nadu',
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.taxByHsn.cgstPaise).toBe(0);
    expect(result.taxByHsn.sgstPaise).toBe(0);
    expect(result.taxByHsn.igstPaise).toBeGreaterThan(0);
  });

  it('CGST + SGST always equals what IGST would have been', () => {
    const line = makeLine({ unitPricePaise: 118_000, gstRate: 1800 });

    const kerala = calculateCart({
      lines: [line],
      discounts: [],
      shippingState: 'Kerala',
      paymentMethod: PAYMENT,
      now: NOW,
    });
    const tamilNadu = calculateCart({
      lines: [line],
      discounts: [],
      shippingState: 'Tamil Nadu',
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(kerala.taxByHsn.cgstPaise + kerala.taxByHsn.sgstPaise).toBe(
      tamilNadu.taxByHsn.igstPaise,
    );
  });

  it('produces three correct HSN groups for a mixed-rate cart', () => {
    const lines = [
      makeLine({ id: 'dishwash', hsnCode: '3401', gstRate: 1800, unitPricePaise: 100_000 }),
      makeLine({ id: 'ghee', hsnCode: '0405', gstRate: 1200, unitPricePaise: 50_000 }),
      makeLine({ id: 'jaggery', hsnCode: '1701', gstRate: 0, unitPricePaise: 20_000 }),
    ];

    const result = calculateCart({
      lines,
      discounts: [],
      shippingState: 'Kerala',
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.taxByHsn.rows).toHaveLength(3);
    const byHsn = Object.fromEntries(result.taxByHsn.rows.map((r) => [r.hsn, r]));
    expect(byHsn['3401'].rate).toBe(1800);
    expect(byHsn['0405'].rate).toBe(1200);
    expect(byHsn['1701'].taxPaise).toBe(0);
  });

  it('clamps a discount larger than the subtotal, never going negative', () => {
    const discount = makeDiscount({ type: 'FIXED_AMOUNT', valuePaise: 10_000_000 });
    const result = calculateCart({
      lines: [makeLine({ unitPricePaise: 10_000, quantity: 1 })],
      discounts: [discount],
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.discountPaise).toBe(10_000);
    expect(result.lines[0].netPaise).toBe(0);
    expect(result.totalPaise).toBe(0);
  });

  it('ignores expired, not-yet-started, and exhausted discounts', () => {
    const expired = makeDiscount({
      type: 'FIXED_AMOUNT',
      valuePaise: 1_000,
      startsAt: new Date('2020-01-01T00:00:00Z'),
      endsAt: new Date('2020-06-01T00:00:00Z'),
    });
    const notYetStarted = makeDiscount({
      type: 'FIXED_AMOUNT',
      valuePaise: 1_000,
      startsAt: new Date('2030-01-01T00:00:00Z'),
    });
    const exhausted = makeDiscount({
      type: 'FIXED_AMOUNT',
      valuePaise: 1_000,
      usageLimit: 5,
      usageCount: 5,
    });

    const result = calculateCart({
      lines: [makeLine({ unitPricePaise: 10_000, quantity: 1 })],
      discounts: [expired, notYetStarted, exhausted],
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.appliedDiscounts).toEqual([]);
    expect(result.discountPaise).toBe(0);
  });

  it('prices a combo at its package price, never derived from components', () => {
    const result = calculateCart({
      lines: [makeLine({ kind: 'COMBO', id: 'combo-1', unitPricePaise: 34_900, quantity: 2 })],
      discounts: [],
      paymentMethod: PAYMENT,
      now: NOW,
    });

    expect(result.lines[0].subtotalPaise).toBe(69_800);
  });

  it('FREE_SHIPPING zeroes shipping but leaves the COD fee intact', () => {
    const discount = makeDiscount({ type: 'FREE_SHIPPING' });
    const result = calculateCart({
      lines: [makeLine({ unitPricePaise: 10_000 })],
      discounts: [discount],
      shippingPaise: 9_900,
      codFeePaise: 2_000,
      paymentMethod: 'COD',
      now: NOW,
    });

    expect(result.shippingPaise).toBe(0);
    expect(result.codFeePaise).toBe(2_000);
  });

  it('sums line discounts to exactly discountPaise with no drift', () => {
    const discount = makeDiscount({ type: 'PERCENTAGE', valueBps: 1333 }); // an awkward rate
    const lines = [
      makeLine({ id: 'a', unitPricePaise: 9_901, quantity: 3 }),
      makeLine({ id: 'b', unitPricePaise: 4_999, quantity: 7 }),
      makeLine({ id: 'c', unitPricePaise: 12_345, quantity: 1 }),
    ];

    const result = calculateCart({ lines, discounts: [discount], paymentMethod: PAYMENT, now: NOW });

    const lineSum = result.lines.reduce((sum, l) => sum + l.discountPaise, 0);
    expect(lineSum).toBe(result.discountPaise);
  });

  it('returns only integers everywhere', () => {
    const discount = makeDiscount({ type: 'PERCENTAGE', valueBps: 777 });
    const lines = [
      makeLine({ id: 'a', unitPricePaise: 9_901, quantity: 3, hsnCode: '3401', gstRate: 1800 }),
      makeLine({ id: 'b', unitPricePaise: 4_999, quantity: 7, hsnCode: '0405', gstRate: 1200 }),
    ];

    const result = calculateCart({
      lines,
      discounts: [discount],
      shippingState: 'Kerala',
      shippingPaise: 4_999,
      codFeePaise: 1_500,
      paymentMethod: 'COD',
      now: NOW,
    });

    const numbers = [
      result.subtotalPaise,
      result.discountPaise,
      result.shippingPaise,
      result.codFeePaise,
      result.totalPaise,
      ...result.lines.flatMap((l) => [l.subtotalPaise, l.discountPaise, l.netPaise]),
      ...result.taxByHsn.rows.flatMap((r) => [
        r.taxablePaise,
        r.cgstPaise,
        r.sgstPaise,
        r.igstPaise,
        r.taxPaise,
        r.inclusivePaise,
      ]),
    ];

    for (const n of numbers) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  /*
    `cart-pricing.ts` returns a `lineKeys` array index-aligned with these
    results, so that the cart drawer can regroup a combo's exploded component
    lines back into the one row the customer chose. Two lines of the same combo
    with different fragrances share an id and differ only in position, so if
    this alignment ever broke, the drawer would merge them and show the wrong
    quantity against the wrong fragrances.
  */
  it('returns one result per input line, in the same order', () => {
    const lines = [
      makeLine({ kind: 'COMBO', id: 'combo-1', unitPricePaise: 30_000, hsnCode: '3401' }),
      makeLine({ kind: 'VARIANT', id: 'variant-9', unitPricePaise: 12_000, hsnCode: '1517' }),
      makeLine({ kind: 'COMBO', id: 'combo-1', unitPricePaise: 20_000, hsnCode: '0904' }),
    ];

    const result = calculateCart({ lines, discounts: [], paymentMethod: PAYMENT, now: NOW });

    expect(result.lines).toHaveLength(lines.length);
    result.lines.forEach((priced, index) => {
      expect(priced.id).toBe(lines[index].id);
      expect(priced.kind).toBe(lines[index].kind);
      expect(priced.hsnCode).toBe(lines[index].hsnCode);
      expect(priced.unitPricePaise).toBe(lines[index].unitPricePaise);
    });
  });
});
