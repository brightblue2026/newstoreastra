/**
 * Money. Every amount in this application is an integer number of paise.
 *
 * ₹149.00 is `14900`. There are no floats, no `Decimal`, and no other
 * representation. Anything that reads a price from the database, sends one to
 * Razorpay, or prints one on an invoice goes through this module.
 */

/** An integer number of paise. 100 paise = ₹1. */
export type Paise = number;

/** Shown wherever a variant has no published price yet. Never "₹0.00". */
export const PRICE_ON_REQUEST = 'Price on request';

const PAISE_PER_RUPEE = 100;

/**
 * Largest amount we will accept anywhere. ₹1 crore in paise. Well inside the
 * safe integer range, and far above any plausible order, so anything larger is
 * a bug or a tampered input rather than a real sale.
 */
export const MAX_PAISE = 1_000_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** True when `value` is a non-negative integer inside the accepted range. */
export function isPaise(value: unknown): value is Paise {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_PAISE
  );
}

/**
 * Throws unless `value` is a valid paise amount. Use at every boundary where a
 * number claims to be money — parsed input, an external API response, a value
 * read back from JSON.
 */
export function assertPaise(
  value: unknown,
  label = 'amount',
): asserts value is Paise {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, received ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${label} must be a whole number of paise, received ${value}. Money is never a float.`,
    );
  }
  if (value < 0) {
    throw new MoneyError(`${label} must not be negative, received ${value}`);
  }
  if (value > MAX_PAISE) {
    throw new MoneyError(`${label} exceeds the maximum of ${MAX_PAISE} paise, received ${value}`);
  }
}

/**
 * Parses a rupee amount typed by a human into paise.
 *
 * Accepts "149", "149.5", "149.50", "₹149.50", "1,49,000.50" and the same with
 * spaces. Rejects anything with more than two decimal places, because a price
 * finer than one paise cannot be charged.
 *
 * Deliberately string-based: `Math.round(149.55 * 100)` is 14955 today and a
 * source of one-paise drift tomorrow.
 */
export function parseRupeesToPaise(input: string | number): Paise {
  const raw = typeof input === 'number' ? String(input) : input;
  const cleaned = raw.replace(/[₹,\s]/g, '').trim();

  if (cleaned === '') {
    throw new MoneyError('Enter an amount in rupees.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    if (/^\d+\.\d{3,}$/.test(cleaned)) {
      throw new MoneyError(
        `"${raw}" has more than two decimal places. The smallest amount that can be charged is one paise.`,
      );
    }
    throw new MoneyError(`"${raw}" is not a valid rupee amount. Use a number such as 149 or 149.50.`);
  }

  const [rupees, fraction = ''] = cleaned.split('.');
  const paise = Number(rupees) * PAISE_PER_RUPEE + Number(fraction.padEnd(2, '0'));

  assertPaise(paise, 'amount');
  return paise;
}

/**
 * Renders paise as a plain decimal rupee string with no symbol and no grouping:
 * `14900` becomes `"149.00"`. This is the form to put in a form field the user
 * will edit, and the form `parseRupeesToPaise` round-trips exactly.
 */
export function paiseToRupeesInput(paise: Paise): string {
  assertPaise(paise);
  const rupees = Math.trunc(paise / PAISE_PER_RUPEE);
  const fraction = paise % PAISE_PER_RUPEE;
  return `${rupees}.${String(fraction).padStart(2, '0')}`;
}

export interface FormatINROptions {
  /** Include the ₹ symbol. Default true. */
  symbol?: boolean;
  /**
   * Render whole-rupee amounts without the trailing ".00" — `14900` becomes
   * "₹149" rather than "₹149.00". Default false, because a constant two
   * decimals keeps prices the same width under `tabular-nums` and stops digits
   * jumping when a variant with a different price is selected.
   */
  trimWholeRupees?: boolean;
}

/**
 * The one place paise become something a person reads.
 *
 * Uses Indian digit grouping — `10000000` paise is "₹1,00,000.00", not
 * "₹100,000.00".
 */
export function formatINR(paise: Paise, options: FormatINROptions = {}): string {
  assertPaise(paise);
  const { symbol = true, trimWholeRupees = false } = options;

  const isWholeRupees = paise % PAISE_PER_RUPEE === 0;
  const fractionDigits = trimWholeRupees && isWholeRupees ? 0 : 2;

  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(paise / PAISE_PER_RUPEE);

  return symbol ? `₹${formatted}` : formatted;
}

/**
 * Renders a price that may not exist yet. Most of this catalogue has no
 * published price, and a missing price must never render as ₹0.00 — that is
 * exactly how the WooCommerce site this replaces ended up unusable.
 */
export function formatPrice(
  paise: Paise | null | undefined,
  options?: FormatINROptions,
): string {
  if (paise === null || paise === undefined) return PRICE_ON_REQUEST;
  return formatINR(paise, options);
}

/** True when a variant can be bought. A null price is browse-only. */
export function isPurchasable(pricePaise: Paise | null | undefined): pricePaise is Paise {
  return isPaise(pricePaise);
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–99 in words. Empty string for 0, so callers can drop the group entirely. */
function twoDigitsToWords(value: number): string {
  if (value < 20) return ONES[value];
  const tens = TENS[Math.floor(value / 10)];
  const ones = ONES[value % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/** 0–999 in words, using "Hundred" — the same in both numbering systems. */
function threeDigitsToWords(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigitsToWords(rest));
  return parts.join(' ');
}

/**
 * A whole number in words using the **Indian** numbering system: crore, lakh,
 * thousand, hundred. `150000` is "One Lakh Fifty Thousand", never "One Hundred
 * Fifty Thousand".
 *
 * The grouping is 2-2-3 above the hundreds, not 3-3-3, which is why this cannot
 * be a loop over a single thousands scale.
 */
function integerToIndianWords(value: number): string {
  if (value === 0) return 'Zero';

  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1000);
  const rest = value % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  if (rest) parts.push(threeDigitsToWords(rest));

  return parts.join(' ');
}

/**
 * The amount in words, as an Indian tax invoice prints it:
 * `149900` → "Rupees One Thousand Four Hundred Ninety Nine and Fifty Paise
 * Only".
 *
 * This is not decoration. Rule 46 of the CGST Rules does not itself mandate it,
 * but it is universal practice on Indian invoices and it is what makes an
 * invoice hard to alter after the fact — the figure and the words have to
 * agree, so changing one digit is visible. It is generated from the same paise
 * integer `formatINR` renders, so the two can never disagree.
 *
 * "Paise" is invariant in this usage — fifty paise, one paise — so no plural is
 * formed.
 */
export function amountInWords(paise: Paise): string {
  assertPaise(paise);

  const rupees = Math.trunc(paise / PAISE_PER_RUPEE);
  const fraction = paise % PAISE_PER_RUPEE;

  const parts = [`Rupees ${integerToIndianWords(rupees)}`];
  if (fraction > 0) parts.push(`and ${integerToIndianWords(fraction)} Paise`);

  return `${parts.join(' ')} Only`;
}

/** Adds amounts, asserting each one and the result. */
export function sumPaise(...amounts: Paise[]): Paise {
  const total = amounts.reduce((acc, amount, index) => {
    assertPaise(amount, `amount at index ${index}`);
    return acc + amount;
  }, 0);
  assertPaise(total, 'total');
  return total;
}

/** Subtracts `b` from `a`, clamped at zero. A total is never negative. */
export function subtractPaise(a: Paise, b: Paise): Paise {
  assertPaise(a, 'minuend');
  assertPaise(b, 'subtrahend');
  return Math.max(0, a - b);
}

/**
 * Applies a basis-point rate to an amount, rounding half up.
 * `applyBps(200000, 1000)` is 10% of ₹2,000 — `20000` paise.
 */
export function applyBps(paise: Paise, bps: number): Paise {
  assertPaise(paise);
  if (!Number.isInteger(bps) || bps < 0) {
    throw new MoneyError(`Basis points must be a non-negative integer, received ${bps}`);
  }
  return Math.round((paise * bps) / 10_000);
}

/**
 * Splits `total` across `weights` in proportion, in whole paise, so the parts
 * sum to exactly `total`.
 *
 * Each share is floored, then the shortfall is handed one paise at a time to
 * the largest weights first. This is how a cart-level discount is pushed back
 * onto individual lines without losing or inventing a paise.
 */
export function distributeProportionally(total: Paise, weights: number[]): Paise[] {
  assertPaise(total);
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError('Weights must be non-negative finite numbers.');
  }

  const weightTotal = weights.reduce((a, b) => a + b, 0);

  // Nothing to weigh by — spread evenly rather than dividing by zero.
  if (weightTotal === 0) {
    const base = Math.floor(total / weights.length);
    const shares = weights.map(() => base);
    let remainder = total - base * weights.length;
    for (let i = 0; remainder > 0; i = (i + 1) % weights.length, remainder--) {
      shares[i] += 1;
    }
    return shares;
  }

  const shares = weights.map((w) => Math.floor((total * w) / weightTotal));
  let remainder = total - shares.reduce((a, b) => a + b, 0);

  // Largest weight first, so the rounding crumb lands on the biggest line.
  const order = weights
    .map((w, index) => ({ w, index }))
    .sort((a, b) => b.w - a.w || a.index - b.index);

  for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder--) {
    shares[order[i].index] += 1;
  }

  const check = shares.reduce((a, b) => a + b, 0);
  if (check !== total) {
    throw new MoneyError(
      `Distribution lost money: parts sum to ${check}, expected ${total}. This is a bug.`,
    );
  }

  return shares;
}
