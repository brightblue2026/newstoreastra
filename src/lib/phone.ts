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
 * Normalises to the bare ten digits of a plausible Indian mobile number, or
 * null. The one place this rule is decided — `cart-schema.ts`'s checkout
 * validation and `CheckoutForm.tsx`'s client-side "is this complete" check
 * both call this rather than re-encoding the rule themselves.
 *
 * Deliberately does not blindly strip a leading "91" or "0": a bare ten-digit
 * mobile can itself start with "91" (e.g. 9198765432, first digit 9), so a
 * prefix is only stripped when the *total length* says it's actually a
 * country-code or trunk prefix — twelve digits starting "91", or eleven
 * starting "0" — never inferred from the leading characters alone.
 */
export function normaliseIndianMobile(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');

  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  if (/^(91|0)[6-9]\d{9}$/.test(digits)) return digits.slice(-10);

  return null;
}

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
  const mobile = normaliseIndianMobile(phone);
  return mobile ? `91${mobile}` : null;
}
