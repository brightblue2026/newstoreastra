/*
  What deleting photos will do, in words, worked out before anything is
  deleted. A delete cannot be undone (the file goes from storage at once), so
  the question names the consequence instead of asking "Are you sure?".

  A photo is a stored picture (`publicId`) shown by one or more rows: one row
  for the product as a whole, or one per variant it is used for.
*/

export interface PhotoRow {
  id: string;
  publicId: string;
}

/** How many different pictures the product still has once these rows are gone. */
export function picturesLeftAfter(rows: PhotoRow[], removingRowIds: string[]): number {
  const removing = new Set(removingRowIds);
  return new Set(rows.filter((row) => !removing.has(row.id)).map((row) => row.publicId)).size;
}

/** The rows that hold the same picture as `rowId`, `rowId` included. */
export function rowsOfSamePicture(rows: PhotoRow[], rowId: string): string[] {
  const publicId = rows.find((row) => row.id === rowId)?.publicId;
  return publicId ? rows.filter((row) => row.publicId === publicId).map((row) => row.id) : [];
}

/**
 * The warning shown above the delete buttons, or null when deleting changes
 * nothing a customer can see beyond the photo itself.
 */
export function deleteWarning({
  productIsActive,
  picturesLeft,
}: {
  productIsActive: boolean;
  picturesLeft: number;
}): string | null {
  if (picturesLeft > 0) return null;
  return productIsActive
    ? 'This product is on the store, and this leaves it with no photo at all. Customers will see it without a picture until another is added.'
    : 'This leaves the product with no photo. It cannot be published again until it has one.';
}

/** The question itself: what is about to be deleted. */
export function deleteQuestion({
  count,
  scope,
  usedByOthers,
}: {
  /** Photos selected. */
  count: number;
  /** `this`: from the variant or product it is on; `everywhere`: every use of it. */
  scope: 'this' | 'everywhere';
  /** How many other variants or places show the same picture. */
  usedByOthers: number;
}): string {
  if (count > 1) return `Delete these ${count} photos? This cannot be undone.`;
  if (scope === 'this' && usedByOthers > 0) {
    return `Take this photo off here? ${usedByOthers === 1 ? 'The one other place using it keeps it' : `The ${usedByOthers} other places using it keep it`}.`;
  }
  if (scope === 'everywhere' && usedByOthers > 0) {
    return `Delete this photo everywhere it is used (${usedByOthers + 1} places)? This cannot be undone.`;
  }
  return 'Delete this photo? This cannot be undone.';
}
