/**
 * How many products a brand has, as a shopper reads it. A brand with nothing
 * on sale yet says so instead of "0 products": every brand stays listed while
 * its products are being priced.
 */
export function productCountLabel(count: number): string {
  if (count === 0) return 'Products coming soon';
  return `${count} ${count === 1 ? 'product' : 'products'}`;
}
