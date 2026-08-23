/**
 * Phone number normalisation for outbound messaging.
 *
 * Split out of `msg91.ts` and kept free of `server-only` so it can be tested
 * directly — the same reason `combo-choice.ts` sits apart from
 * `cart-pricing.ts`. This is the one pure thing in that module and the one that
 * must not be wrong: a notification sent to a mistyped number reaches a
 * stranger, carrying an order number and a delivery amount.
 *
 * Distinct from `normalisePhone` in `order-access.ts`, which answers a
 * different question — "is this the number on the order?" — and deliberately
 * takes the last ten digits of whatever it is given, because it is comparing
 * two numbers rather than deciding whether one is dialable.
 */

/**
 * An Indian mobile number in the form MSG91 wants: country code, no plus, no
 * separators.
 *
 * Returns null for anything that is not a plausible Indian mobile rather than
 * coercing it. Indian mobile numbers are ten digits beginning 6–9; a landline,
 * a toll-free number, or a string with too many digits is refused rather than
 * truncated, because silently taking the last ten digits of a wrong number
 * produces a real number belonging to someone who did not order anything.
 */
export function toMsg91Number(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');

  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;

  return null;
}
