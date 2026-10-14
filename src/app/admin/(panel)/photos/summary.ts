/*
  The catalogue-wide Photos page: which products have photos, and which still
  need them. Pure, so the counting and filtering are tested without a
  database.
*/

export interface ProductPhotoRow {
  id: string;
  name: string;
  isActive: boolean;
  /** Every photo row of the product, general first, in store order. */
  images: { url: string; alt: string; publicId: string; variantId: string | null }[];
  /** How many photo rows each variant has. */
  variants: { photoCount: number }[];
}

export interface ProductPhotoSummary {
  id: string;
  name: string;
  isActive: boolean;
  cover: { url: string; alt: string } | null;
  /** Different pictures, however many variants share each. */
  pictures: number;
  variants: number;
  variantsWithPhoto: number;
}

export function summarise(product: ProductPhotoRow): ProductPhotoSummary {
  const general = product.images.find((image) => image.variantId === null);
  const cover = general ?? product.images[0] ?? null;
  return {
    id: product.id,
    name: product.name,
    isActive: product.isActive,
    cover: cover ? { url: cover.url, alt: cover.alt } : null,
    pictures: new Set(product.images.map((image) => image.publicId)).size,
    variants: product.variants.length,
    variantsWithPhoto: product.variants.filter((variant) => variant.photoCount > 0).length,
  };
}

export const PHOTO_FILTERS = [
  { key: 'all', label: 'All products' },
  { key: 'none', label: 'Needs a photo' },
  { key: 'live-none', label: 'On the store without a photo' },
  { key: 'variants', label: 'Variants without photos' },
] as const;

export type PhotoFilter = (typeof PHOTO_FILTERS)[number]['key'];

export function parseFilter(value: string | undefined): PhotoFilter {
  return PHOTO_FILTERS.some((filter) => filter.key === value) ? (value as PhotoFilter) : 'all';
}

export function inFilter(product: ProductPhotoSummary, filter: PhotoFilter): boolean {
  switch (filter) {
    case 'none':
      return product.pictures === 0;
    case 'live-none':
      return product.isActive && product.pictures === 0;
    case 'variants':
      return product.variantsWithPhoto < product.variants;
    default:
      return true;
  }
}

/** Case-insensitive name search; every word must appear. */
export function matchesSearch(product: ProductPhotoSummary, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const name = product.name.toLowerCase();
  return words.every((word) => name.includes(word));
}

/** What an empty filter says, so an empty list reads as good news when it is. */
export function emptyMessage(filter: PhotoFilter, searching: boolean): string {
  if (searching) return 'No product matches that search.';
  switch (filter) {
    case 'none':
      return 'Every product has at least one photo.';
    case 'live-none':
      return 'Every product on the store has a photo.';
    case 'variants':
      return 'Every variant has its own photo.';
    default:
      return 'No products yet.';
  }
}
