/**
 * How a customer reaches BBTC.
 *
 * From the master brief §"Toll free 18001230621 · info@brightblue.in". One
 * module so the "Price on request" enquiry link, the footer and any future
 * contact page cannot drift apart — most of this catalogue has no published
 * price yet, so this link is the primary conversion path today, not a
 * courtesy.
 */

export const CONTACT = {
  tollFree: '18001230621',
  /** `tel:` needs the digits unpunctuated. */
  tollFreeHref: 'tel:18001230621',
  email: 'info@brightblue.in',
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
