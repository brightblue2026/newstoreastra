/**
 * How a customer reaches BBTC.
 *
 * Toll-free confirmed against the live bbtcglobal.com site (matches the
 * brochure). Email is the store's own address, given directly rather than
 * the brochure's `info@brightblue.in` — that domain is the old WooCommerce
 * site this project replaces, not the store's contact channel. One module so
 * the "Price on request" enquiry link, the footer and any future contact
 * page cannot drift apart — most of this catalogue has no published price
 * yet, so this link is the primary conversion path today, not a courtesy.
 *
 * The values themselves live in `business.ts`, with the rest of the seller's
 * details; this module keeps the shapes the storefront already uses.
 */

import { BUSINESS } from '@/lib/business';

export const CONTACT = {
  tollFree: BUSINESS.tollFreeDigits,
  /** `tel:` needs the digits unpunctuated. */
  tollFreeHref: `tel:${BUSINESS.tollFreeDigits}`,
  /** Grouped the way Indian toll-free numbers are read aloud. */
  tollFreeDisplay: BUSINESS.tollFree,
  email: BUSINESS.email,
} as const;

/**
 * A pre-addressed enquiry link for a product with no published price.
 *
 * The subject carries the product and, when one is selected, the SKU — so an
 * enquiry arrives identifying exactly what was being looked at rather than
 * "hi, how much is the dish wash".
 */
export function enquiryHref(productName: string, sku?: string | null): string {
  const subject = sku
    ? `Price enquiry: ${productName} (${sku})`
    : `Price enquiry: ${productName}`;

  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}`;
}
