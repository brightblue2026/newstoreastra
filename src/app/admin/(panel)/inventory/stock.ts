/**
 * Pure stock arithmetic for the inventory admin.
 *
 * Stock is held per variant *per location* — `Inventory` is keyed
 * `@@unique([variantId, locationId])`. The order engine in `src/lib/orders.ts`
 * already reserves, commits, releases and restocks those rows; this screen is
 * the only way to put numbers into them in the first place. Until it existed,
 * every checkout allocated against an empty table.
 *
 * Two fields, two owners:
 *
 * - `quantity` is **ours**. It is what a human counted on a shelf, and this
 *   screen sets it.
 * - `reserved` is the **order engine's**. It rises when a customer is part-way
 *   through checkout and falls when the order is paid or abandoned. Nothing
 *   here writes it — a manager who could edit `reserved` by hand could silently
 *   oversell, and the number would be wrong again a second later anyway.
 *
 * Framework-free so the arithmetic can be unit tested without a database or a
 * rendered page, matching `../products/variant-rows.ts` and `src/lib/money.ts`.
 */

/** One `Inventory` row, reduced to the fields the arithmetic needs. */
export interface StockRow {
  locationId: string;
  locationName: string;
  quantity: number;
  reserved: number;
  lowStockAt: number;
}

export interface StockSummary {
  /** Counted on the shelf, across every location. */
  onHand: number;
  /** Held for carts and unpaid orders, across every location. */
  reserved: number;
  /** What a new customer could actually buy. Never negative. */
  available: number;
  /** Locations that carry this variant and have fallen to their alert level. */
  lowLocations: StockRow[];
  /** True when this variant has no `Inventory` row anywhere. */
  notStocked: boolean;
  /** Counted, but every location is empty — distinct from never counted. */
  outOfStock: boolean;
}

/**
 * What one location can still sell.
 *
 * Clamped at zero: `reserved` can briefly exceed `quantity` where a
 * reservation outlives the stock it was taken against, and showing a shop
 * owner "-3 available" invites them to "correct" a number that is not wrong.
 */
export function availableAt(row: Pick<StockRow, 'quantity' | 'reserved'>): number {
  return Math.max(0, row.quantity - row.reserved);
}

/**
 * Whether a location holds this variant at all.
 *
 * An empty row means "we don't carry it here" far more often than "we sold
 * out", because the editor lists every active location and the ones that never
 * stock an item are left at zero — as that page tells the user to do. Treating
 * those as low stock made a variant with 50 bottles at the packing centre
 * report "Low at" the ten offices that were never meant to hold any, which is
 * how a warning people ignore gets made.
 *
 * The cost of the rule is the genuine sell-out: a location that really did run
 * to zero stops being named individually. `summarise` covers that case at the
 * variant level instead — every location empty is reported as out of stock,
 * which is the more useful sentence anyway.
 */
export function carriesStock(row: Pick<StockRow, 'quantity' | 'reserved'>): boolean {
  return row.quantity > 0 || row.reserved > 0;
}

/**
 * Whether one location needs reordering.
 *
 * Measured against `available`, not `quantity` — stock already promised to a
 * customer is not stock you can sell, and a threshold that ignores that tells
 * you everything is fine right up until it isn't.
 */
export function isLowAt(row: StockRow): boolean {
  if (!carriesStock(row)) return false;
  return availableAt(row) <= row.lowStockAt;
}

/** Rolls every location for one variant into the numbers the list shows. */
export function summarise(rows: StockRow[]): StockSummary {
  const onHand = rows.reduce((total, row) => total + row.quantity, 0);
  const reserved = rows.reduce((total, row) => total + row.reserved, 0);

  return {
    onHand,
    reserved,
    available: rows.reduce((total, row) => total + availableAt(row), 0),
    lowLocations: rows.filter(isLowAt),
    notStocked: rows.length === 0,
    outOfStock: rows.length > 0 && !rows.some(carriesStock),
  };
}

/**
 * A variant nobody has counted yet is *not* "low stock" — it is unknown, and
 * the two want different actions from the user: one says reorder, the other
 * says go and count. The list badges them separately for that reason.
 */
export function needsAttention(summary: StockSummary): boolean {
  return summary.notStocked || summary.outOfStock || summary.lowLocations.length > 0;
}

export class StockInputError extends Error {}

/** The most any one location can hold — a typo guard, not a real warehouse limit. */
export const MAX_QUANTITY = 1_000_000;

/**
 * Reads a quantity a human typed. Whole units only: this catalogue is counted
 * in bottles and packets, never in halves.
 *
 * Blank is rejected rather than treated as zero. "I left it empty" and "there
 * are none left" are different statements, and guessing turns the first into
 * the second — the same reasoning that keeps a null price out of ₹0.00.
 */
export function parseQuantity(raw: string, label = 'Quantity'): number {
  const trimmed = raw.trim();
  if (trimmed === '') throw new StockInputError(`${label} is required. Enter 0 if there are none.`);

  // Number('') is 0 and Number(' 12 ') is 12, so the blank check above has to
  // come first; everything else that is not a plain whole number is refused.
  if (!/^\d+$/.test(trimmed)) {
    throw new StockInputError(`${label} must be a whole number, like 24.`);
  }

  const value = Number(trimmed);
  if (value > MAX_QUANTITY) {
    throw new StockInputError(`${label} looks wrong — ${MAX_QUANTITY.toLocaleString('en-IN')} is the most this accepts.`);
  }
  return value;
}

/** Search across the fields a manager would actually type: SKU, product, size, fragrance. */
export function matchesSearch(
  haystack: { sku: string; productName: string; size: string; variantName: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [haystack.sku, haystack.productName, haystack.size, haystack.variantName ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle);
}
