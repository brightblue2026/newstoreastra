import { foodLabelIncomplete, readFoodLabel } from './format';

/**
 * The Phase 1 publish guard, as a list of what is still missing: a variant, an
 * image somewhere on the product or one of its variants, an HSN code, a GST
 * rate, and — for food — a complete label.
 *
 * One function for the action that enforces it and the screens that explain
 * it, so the admin is never told a product is ready when publishing would
 * refuse it. Each entry reads after "It still needs".
 */
export interface PublishCheckInput {
  hsnCode: string | null;
  gstRate: number | null;
  isFoodProduct: boolean;
  foodLabel: unknown;
  images: unknown[];
  variants: { images?: unknown[] }[];
}

export function publishBlockers(product: PublishCheckInput): string[] {
  const missing: string[] = [];

  if (product.variants.length === 0) missing.push('at least one variant');
  const hasImage =
    product.images.length > 0 || product.variants.some((variant) => (variant.images?.length ?? 0) > 0);
  if (!hasImage) missing.push('a photo');
  if (!product.hsnCode) missing.push('an HSN code');
  // Null is "not entered", not 0%: nil-rated goods save an explicit 0.
  if (product.gstRate === null) missing.push('a GST rate');
  if (product.isFoodProduct && foodLabelIncomplete(readFoodLabel(product.foodLabel))) {
    missing.push('a complete food label');
  }

  return missing;
}

/** "a photo", "a photo and an HSN code", "a photo, an HSN code and a GST rate". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
