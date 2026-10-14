import type { PhotoCardData } from './image-card';

/*
  Turns a product's saved photo rows into what the photo cards show. One
  stored picture can be several rows (the product as a whole, and each variant
  it is used for); a card is one row, and knows every other place its picture
  is used.
*/

export interface SavedPhotoRow {
  id: string;
  url: string;
  alt: string;
  publicId: string;
  variantId: string | null;
}

/** The photos of one group, in the order given: `null` for the product as a whole. */
export function photosIn(rows: SavedPhotoRow[], variantId: string | null): PhotoCardData[] {
  return rows
    .filter((row) => row.variantId === variantId)
    .map((row) => {
      const uses = rows.filter((other) => other.publicId === row.publicId);
      return {
        id: row.id,
        url: row.url,
        alt: row.alt,
        publicId: row.publicId,
        usedFor: {
          general: uses.some((use) => use.variantId === null),
          variantIds: uses.flatMap((use) => (use.variantId ? [use.variantId] : [])),
        },
      };
    });
}

/** Ordering for `findMany`: the order the store shows photos in. */
export const PHOTO_ORDER = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
