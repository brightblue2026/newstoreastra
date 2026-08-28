/**
 * The pricing engine — master brief §8.
 *
 * `calculateCart` is pure: it takes the cart, the candidate discounts, and the
 * settings needed to price it, and returns a result. It never queries the
 * database. That is what makes it testable without a DB and safe to re-run on
 * every cart read — the server is always the source of truth for a total,
 * never the price a client sent back.
 *
 * Rule order matters and is numbered below exactly as §8 lists it. Moving a
 * step changes the answer.
 */

import { buildTaxByHsn, type Bps, type TaxByHsnResult } from './gst';
import { assertPaise, distributeProportionally, type Paise } from './money';

export type CartLineKind = 'VARIANT' | 'COMBO';

export interface CartLine {
  kind: CartLineKind;
  /** `ProductVariant.id` or `Combo.id`. */
  id: string;
  quantity: number;
  /** GST-inclusive. For a combo this is `Combo.pricePaise` — never derived. */
  unitPricePaise: Paise;
  brandId?: string;
  categoryId?: string;
  productId?: string;
  hsnCode: string;
  gstRate: Bps;
}

export type DiscountType =
  | 'PERCENTAGE'
  | 'FIXED_AMOUNT'
  | 'BUY_X_GET_Y'
  | 'FREE_SHIPPING'
  | 'TIERED_QUANTITY';

export type DiscountScope = 'ORDER' | 'BRAND' | 'CATEGORY' | 'PRODUCT' | 'COMBO';

export interface DiscountInput {
  id: string;
  code: string | null;
  type: DiscountType;
  scope: DiscountScope;
  valuePaise: number | null;
  valueBps: number | null;
  tiers: Array<{ minQty: number; valueBps: number }> | null;
  buyQty: number | null;
  getQty: number | null;
  minOrderPaise: number | null;
  maxDiscountPaise: number | null;
  targetIds: string[];
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  stackable: boolean;
  priority: number;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
}

export interface CalculateCartInput {
  lines: CartLine[];
  /** Every discount worth considering — this function decides which apply. */
  discounts: DiscountInput[];
  discountCode?: string;
  shippingState?: string;
  shippingPincode?: string;
  paymentMethod: 'RAZORPAY' | 'COD';
  customerId?: string;
  /** How many times this customer has used each discount, by id. Missing = 0. */
  customerUsage?: Record<string, number>;
  /** Resolved by the caller (Shiprocket rate or flat-rate slab) — pricing.ts prices, it does not rate-shop. */
  shippingPaise?: Paise;
  /** Resolved by the caller (allowlist, value bounds) — zero when not COD. */
  codFeePaise?: Paise;
  /** Injectable for tests. Defaults to `new Date()`. */
  now?: Date;
}

export interface CartLineResult {
  kind: CartLineKind;
  id: string;
  quantity: number;
  unitPricePaise: Paise;
  subtotalPaise: Paise;
  discountPaise: Paise;
  netPaise: Paise;
  hsnCode: string;
  gstRate: Bps;
}

export interface AppliedDiscount {
  discountId: string;
  code: string | null;
  scope: DiscountScope;
  type: DiscountType;
  amountPaise: Paise;
}

export interface PriceResult {
  /**
   * One result per input line, in the same order. `cart-pricing.ts` relies on
   * that alignment to map a priced line back to the cart line it came from —
   * a combo is handed in as several component lines that all carry the
   * combo's own id, so id alone cannot identify one. Asserted in
   * `pricing.test.ts`.
   */
  lines: CartLineResult[];
  subtotalPaise: Paise;
  discountPaise: Paise;
  appliedDiscounts: AppliedDiscount[];
  /** Set when `discountCode` was supplied but did not resolve to a usable discount. */
  invalidDiscountCode: boolean;
  shippingPaise: Paise;
  codFeePaise: Paise;
  taxByHsn: TaxByHsnResult;
  totalPaise: Paise;
}

function scopeMatchesLine(discount: DiscountInput, line: CartLine): boolean {
  switch (discount.scope) {
    case 'ORDER':
      return true;
    case 'BRAND':
      return line.brandId !== undefined && discount.targetIds.includes(line.brandId);
    case 'CATEGORY':
      return line.categoryId !== undefined && discount.targetIds.includes(line.categoryId);
    case 'PRODUCT':
      return line.productId !== undefined && discount.targetIds.includes(line.productId);
    case 'COMBO':
      return line.kind === 'COMBO' && discount.targetIds.includes(line.id);
    default:
      return false;
  }
}

/** Steps 2-3: active, in-window, under its limits, and matching at least one line. */
function gatherCandidates(
  discounts: DiscountInput[],
  lines: CartLine[],
  discountCode: string | undefined,
  customerUsage: Record<string, number>,
  now: Date,
): { candidates: DiscountInput[]; invalidDiscountCode: boolean } {
  const normalizedCode = discountCode?.trim().toUpperCase() || undefined;
  let sawRequestedCode = false;

  const inWindow = (d: DiscountInput) =>
    d.isActive && d.startsAt <= now && (d.endsAt === null || d.endsAt > now);

  const underLimits = (d: DiscountInput) => {
    if (d.usageLimit !== null && d.usageCount >= d.usageLimit) return false;
    if (d.perCustomerLimit !== null && (customerUsage[d.id] ?? 0) >= d.perCustomerLimit) {
      return false;
    }
    return true;
  };

  const matchesMinOrder = (d: DiscountInput) => {
    if (d.minOrderPaise === null) return true;
    const matchingSubtotal = lines
      .filter((line) => scopeMatchesLine(d, line))
      .reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
    return matchingSubtotal >= d.minOrderPaise;
  };

  const candidates = discounts.filter((d) => {
    const isAutomatic = d.code === null;
    const isRequestedCoupon =
      d.code !== null && normalizedCode !== undefined && d.code.toUpperCase() === normalizedCode;
    if (isRequestedCoupon) sawRequestedCode = true;
    if (!isAutomatic && !isRequestedCoupon) return false;

    if (!inWindow(d)) return false;
    if (!underLimits(d)) return false;
    if (!lines.some((line) => scopeMatchesLine(d, line))) return false;
    if (!matchesMinOrder(d)) return false;
    return true;
  });

  const invalidDiscountCode = normalizedCode !== undefined && !sawRequestedCode;
  return { candidates, invalidDiscountCode };
}

/**
 * Step 6: among discounts that refuse to stack, only one survives — the
 * highest `priority`, ties broken by whichever saves the customer more.
 * Stackable discounts are never dropped here.
 */
function resolveConflicts(
  candidates: DiscountInput[],
  lines: CartLine[],
): DiscountInput[] {
  const stackable = candidates.filter((d) => d.stackable);
  const exclusive = candidates.filter((d) => !d.stackable);

  if (exclusive.length <= 1) return [...stackable, ...exclusive];

  const valueOf = (d: DiscountInput): Paise => {
    const matching = lines.filter((line) => scopeMatchesLine(d, line));
    const matchingSubtotal = matching.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
    return hypotheticalAmount(d, matching, matchingSubtotal);
  };

  const winner = exclusive.reduce((best, current) => {
    if (current.priority !== best.priority) {
      return current.priority > best.priority ? current : best;
    }
    return valueOf(current) > valueOf(best) ? current : best;
  });

  return [...stackable, winner];
}

/** The raw discount amount a discount would remove from its matching lines, before capping. */
function hypotheticalAmount(
  discount: DiscountInput,
  matchingLines: CartLine[],
  matchingSubtotal: Paise,
): Paise {
  switch (discount.type) {
    case 'PERCENTAGE': {
      const raw = Math.round((matchingSubtotal * (discount.valueBps ?? 0)) / 10_000);
      return capAtMax(discount, raw);
    }
    case 'FIXED_AMOUNT':
      return capAtMax(discount, Math.min(discount.valuePaise ?? 0, matchingSubtotal));
    case 'BUY_X_GET_Y':
      return capAtMax(discount, buyXGetYAmount(discount, matchingLines));
    case 'TIERED_QUANTITY':
      return capAtMax(discount, tieredAmount(discount, matchingLines, matchingSubtotal));
    case 'FREE_SHIPPING':
      return 0;
    default:
      return 0;
  }
}

function capAtMax(discount: DiscountInput, raw: Paise): Paise {
  if (discount.maxDiscountPaise !== null && raw > discount.maxDiscountPaise) {
    return discount.maxDiscountPaise;
  }
  return Math.max(0, raw);
}

/** Flattens quantities into one price per unit, so "the cheapest unit" is well-defined. */
function flattenUnits(lines: CartLine[]): Paise[] {
  const units: Paise[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i++) units.push(line.unitPricePaise);
  }
  return units;
}

/** Every group of `buyQty + getQty` units gives away the `getQty` cheapest units in it. */
function buyXGetYAmount(discount: DiscountInput, matchingLines: CartLine[]): Paise {
  const buyQty = discount.buyQty ?? 0;
  const getQty = discount.getQty ?? 0;
  if (buyQty <= 0 || getQty <= 0) return 0;

  const units = flattenUnits(matchingLines).sort((a, b) => a - b);
  const groupSize = buyQty + getQty;
  const freeGroups = Math.floor(units.length / groupSize);
  const freeCount = freeGroups * getQty;

  return units.slice(0, freeCount).reduce((sum, price) => sum + price, 0);
}

/** The best tier the matching quantity qualifies for — the largest `minQty` at or below it. */
function tieredAmount(
  discount: DiscountInput,
  matchingLines: CartLine[],
  matchingSubtotal: Paise,
): Paise {
  const tiers = discount.tiers ?? [];
  const quantity = matchingLines.reduce((sum, line) => sum + line.quantity, 0);

  const eligible = tiers.filter((tier) => quantity >= tier.minQty);
  if (eligible.length === 0) return 0;

  const best = eligible.reduce((a, b) => (b.minQty > a.minQty ? b : a));
  return Math.round((matchingSubtotal * best.valueBps) / 10_000);
}

/** Applies one discount to the lines it matches, distributing the amount proportionally. */
function applyToMatchingLines(
  discount: DiscountInput,
  lines: CartLine[],
  remaining: Paise[],
): Paise {
  const matchIndices = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => scopeMatchesLine(discount, line))
    .map(({ index }) => index);

  if (matchIndices.length === 0) return 0;

  const matchingLines = matchIndices.map((i) => lines[i]);
  const matchingSubtotal = matchIndices.reduce((sum, i) => sum + remaining[i], 0);
  if (matchingSubtotal <= 0) return 0;

  const rawAmount = hypotheticalAmount(discount, matchingLines, matchingSubtotal);
  const amount = Math.min(rawAmount, matchingSubtotal);
  if (amount <= 0) return 0;

  const weights = matchIndices.map((i) => remaining[i]);
  const shares = distributeProportionally(amount, weights);

  matchIndices.forEach((lineIndex, shareIndex) => {
    remaining[lineIndex] -= shares[shareIndex];
  });

  return amount;
}

export function calculateCart(input: CalculateCartInput): PriceResult {
  const now = input.now ?? new Date();
  const customerUsage = input.customerUsage ?? {};

  // Step 1: line subtotals.
  const lines = input.lines.map((line) => {
    assertPaise(line.unitPricePaise, 'unit price');
    // Upper-bounded defensively — this runs on whatever a request handed in,
    // and an absurd quantity should fail loudly rather than flow into the tax
    // engine as a giant number.
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > 999) {
      throw new Error(
        `Line quantity must be a whole number from 1 to 999, received ${line.quantity}`,
      );
    }
    return line;
  });

  if (lines.length === 0) {
    const taxByHsn = buildTaxByHsn([], input.shippingState);
    return {
      lines: [],
      subtotalPaise: 0,
      discountPaise: 0,
      appliedDiscounts: [],
      invalidDiscountCode: Boolean(input.discountCode),
      shippingPaise: 0,
      codFeePaise: 0,
      taxByHsn,
      totalPaise: 0,
    };
  }

  const subtotalPaise = lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);

  // Steps 2-3: gather and filter candidates.
  const { candidates, invalidDiscountCode } = gatherCandidates(
    input.discounts,
    lines,
    input.discountCode,
    customerUsage,
    now,
  );

  // Step 6: resolve non-stackable conflicts before applying anything.
  const applying = resolveConflicts(candidates, lines);

  // Order BRAND/CATEGORY/PRODUCT/COMBO first (step 4), then ORDER (step 5).
  const scoped = applying.filter((d) => d.scope !== 'ORDER');
  const orderScoped = applying.filter((d) => d.scope === 'ORDER');

  const remaining = lines.map((l) => l.unitPricePaise * l.quantity);
  const appliedDiscounts: AppliedDiscount[] = [];

  // Step 4.
  for (const discount of scoped) {
    if (discount.type === 'FREE_SHIPPING') {
      appliedDiscounts.push({
        discountId: discount.id,
        code: discount.code,
        scope: discount.scope,
        type: discount.type,
        amountPaise: 0,
      });
      continue;
    }
    const amount = applyToMatchingLines(discount, lines, remaining);
    if (amount > 0) {
      appliedDiscounts.push({
        discountId: discount.id,
        code: discount.code,
        scope: discount.scope,
        type: discount.type,
        amountPaise: amount,
      });
    }
  }

  // Step 5 — ORDER scope sees the post-line-discount remaining amount.
  for (const discount of orderScoped) {
    if (discount.type === 'FREE_SHIPPING') {
      appliedDiscounts.push({
        discountId: discount.id,
        code: discount.code,
        scope: discount.scope,
        type: discount.type,
        amountPaise: 0,
      });
      continue;
    }
    const amount = applyToMatchingLines(discount, lines, remaining);
    if (amount > 0) {
      appliedDiscounts.push({
        discountId: discount.id,
        code: discount.code,
        scope: discount.scope,
        type: discount.type,
        amountPaise: amount,
      });
    }
  }

  const freeShipping = applying.some((d) => d.type === 'FREE_SHIPPING');

  // Steps 7-8 happened inline (capAtMax, and remaining never goes below zero
  // because applyToMatchingLines clamps `amount` to `matchingSubtotal`).
  const lineResults: CartLineResult[] = lines.map((line, index) => {
    const subtotal = line.unitPricePaise * line.quantity;
    const net = Math.max(0, remaining[index]);
    return {
      kind: line.kind,
      id: line.id,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      subtotalPaise: subtotal,
      discountPaise: subtotal - net,
      netPaise: net,
      hsnCode: line.hsnCode,
      gstRate: line.gstRate,
    };
  });

  const totalDiscountPaise = lineResults.reduce((sum, l) => sum + l.discountPaise, 0);

  // Step 9: shipping, then COD fee. FREE_SHIPPING zeroes shipping only —
  // the COD fee is a separate charge for handling cash, not a shipping cost.
  const shippingPaise = freeShipping ? 0 : (input.shippingPaise ?? 0);
  const codFeePaise = input.paymentMethod === 'COD' ? (input.codFeePaise ?? 0) : 0;

  // Step 10: tax last, on the post-discount amount, per HSN.
  const taxByHsn = buildTaxByHsn(
    lineResults.map((l) => ({
      hsnCode: l.hsnCode,
      gstRate: l.gstRate,
      inclusivePaise: l.netPaise,
    })),
    input.shippingState,
  );

  const totalPaise = lineResults.reduce((sum, l) => sum + l.netPaise, 0) + shippingPaise + codFeePaise;
  assertPaise(subtotalPaise, 'subtotal');
  assertPaise(totalPaise, 'order total');

  return {
    lines: lineResults,
    subtotalPaise,
    discountPaise: totalDiscountPaise,
    appliedDiscounts,
    invalidDiscountCode,
    shippingPaise,
    codFeePaise,
    taxByHsn,
    totalPaise,
  };
}
