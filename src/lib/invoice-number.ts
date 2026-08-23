/**
 * Invoice numbers — brief §10: "Invoice numbers: sequential per financial year,
 * no gaps, generated inside the order transaction."
 *
 * Formatting and parsing only. The sequence itself needs a transaction and an
 * advisory lock, and lives in `invoice.ts` next to the code that assigns it —
 * the same split `order-number.ts` makes, for the same reason: this half is
 * pure and can be tested exhaustively without a database.
 *
 * **Two constraints shape the format, and the tighter one is legal.**
 *
 * Rule 46(b) of the CGST Rules requires a tax invoice number to be "a
 * consecutive serial number not exceeding sixteen characters", using letters,
 * digits, `-` and `/`, unique for a financial year. Sixteen is a hard ceiling,
 * not a guideline — it is what the GSTR-1 return accepts. `BB/INV/2627/00001`
 * reads well and is seventeen, so it is not what this uses.
 *
 * The other constraint is that an invoice number must not be mistakable for an
 * order number. `BB-2627-00001` and `BBTC/2627/00001` are different sequences
 * counting different things, and an accountant reconciling a GST return against
 * a bank statement has to tell at a glance which one is in front of them — so
 * the prefix and the separator both differ, rather than just one of them.
 *
 * `BBTC/2627/00001` is fifteen characters and keeps the same five-digit
 * sequence the order number uses. The length is asserted in a test at the
 * maximum sequence, because the failure mode otherwise is an auditor finding
 * it, not a build.
 */

const PREFIX = 'BBTC';
const SEQUENCE_DIGITS = 5;
const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

/** Rule 46(b) of the CGST Rules: a tax invoice number is at most 16 characters. */
export const MAX_INVOICE_NUMBER_LENGTH = 16;

export class InvoiceNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceNumberError';
  }
}

/*
  The financial year comes from `order-number.ts` rather than being
  reimplemented here. The two sequences have to roll over on the same instant,
  or an invoice raised at 00:30 on 1 April falls in a different year from the
  order it bills.
*/
import { financialYearCode } from './order-number';

export { financialYearCode };

/** `formatInvoiceNumber(1, new Date('2026-05-01'))` → `"BBTC/2627/00001"`. */
export function formatInvoiceNumber(sequence: number, date: Date = new Date()): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new InvoiceNumberError(
      `Invoice sequence must be a whole number from 1 to ${MAX_SEQUENCE}, received ${sequence}`,
    );
  }
  return `${PREFIX}/${financialYearCode(date)}/${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

export interface ParsedInvoiceNumber {
  financialYearCode: string;
  sequence: number;
}

const INVOICE_NUMBER_PATTERN = /^BBTC\/(\d{4})\/(\d{5})$/;

/** The inverse of `formatInvoiceNumber`. Null rather than a throw on a malformed value. */
export function parseInvoiceNumber(invoiceNumber: string): ParsedInvoiceNumber | null {
  const match = INVOICE_NUMBER_PATTERN.exec(invoiceNumber.trim());
  if (!match) return null;
  return { financialYearCode: match[1], sequence: Number(match[2]) };
}

/**
 * The `LIKE` prefix that selects one financial year's invoices.
 *
 * Built here rather than interpolated at the call site so the literal cannot
 * drift apart from `formatInvoiceNumber`. The five-digit zero padding is what
 * makes a lexicographic `ORDER BY ... DESC` pick the numerically highest
 * number.
 */
export function invoiceNumberPrefix(date: Date = new Date()): string {
  return `${PREFIX}/${financialYearCode(date)}/`;
}
