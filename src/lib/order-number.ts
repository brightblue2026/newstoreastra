/**
 * Order numbers — `Order.orderNumber` comment in §7: `"BB-2627-00001"`
 * (financial year).
 *
 * Generating the number itself needs a gapless, race-safe sequence per
 * financial year — that needs a real transaction (a Postgres advisory lock
 * or a counter row) around the moment an `Order` is actually inserted, which
 * doesn't exist yet: creating a real order needs a seller `Entity`, and no
 * entity has `isSeller: true` yet (open question 6 in `DECISIONS.md`). This
 * module is the pure, already-correct half — formatting and parsing — ready
 * for whichever transaction wraps it once that's unblocked.
 */

const PREFIX = 'BB';
const SEQUENCE_DIGITS = 5;
const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

export class OrderNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderNumberError';
  }
}

/**
 * India's financial year runs 1 April – 31 March. `2026-01-15` is in FY
 * 2025-26 (`"2526"`); `2026-04-15` is in FY 2026-27 (`"2627"`).
 */
export function financialYearCode(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new OrderNumberError('Invalid date.');
  // Business dates are Indian dates, independently of the host timezone.
  const india = new Date(date.getTime() + 330 * 60_000);
  const year = india.getUTCFullYear();
  const isBeforeApril = india.getUTCMonth() < 3; // Jan=0, Feb=1, Mar=2
  const startYear = isBeforeApril ? year - 1 : year;
  const two = (y: number) => String(((y % 100) + 100) % 100).padStart(2, '0');
  return `${two(startYear)}${two(startYear + 1)}`;
}

/** `formatOrderNumber(1, new Date('2026-05-01'))` → `"BB-2627-00001"`. */
export function formatOrderNumber(sequence: number, date: Date = new Date()): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new OrderNumberError(
      `Order sequence must be a whole number from 1 to ${MAX_SEQUENCE}, received ${sequence}`,
    );
  }
  return `${PREFIX}-${financialYearCode(date)}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

export interface ParsedOrderNumber {
  financialYearCode: string;
  sequence: number;
}

const ORDER_NUMBER_PATTERN = /^BB-(\d{4})-(\d{5})$/;

/** The inverse of `formatOrderNumber`. Returns null rather than throwing on a malformed value. */
export function parseOrderNumber(orderNumber: string): ParsedOrderNumber | null {
  const match = ORDER_NUMBER_PATTERN.exec(orderNumber.trim());
  if (!match) return null;
  return { financialYearCode: match[1], sequence: Number(match[2]) };
}
