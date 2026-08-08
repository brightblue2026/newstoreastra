/**
 * Stock allocation — the "check inventory → increment `reserved`" step of the
 * §4 order transaction, as pure functions over rows.
 *
 * Pure so that overselling can be tested without Postgres, which is the only
 * kind of test this environment can run. `orders.ts` does the reading and
 * writing inside the transaction; the arithmetic lives here.
 *
 * Two rules that are judgement calls, not spec:
 *
 *   1. **A variant with no `Inventory` row at all is not blocked.** Almost
 *      nothing in this catalogue is stocked in the database yet, and treating
 *      "no row" as "no stock" would reject every order. So an untracked variant
 *      allocates nothing and ships — the honest reading of an empty table is
 *      "nobody is counting this", not "there are none".
 *   2. **Allocation ignores `Location.handles`.** Whether food ships from the
 *      Thrissur or Malappuram units rather than Palakkad is brief §14 Q19, and
 *      unanswered — so stock is drawn from wherever there is stock, deepest
 *      first, rather than guessing a routing rule. When Q19 is answered this is
 *      where the filter goes.
 */

export interface InventoryRow {
  id: string;
  quantity: number;
  reserved: number;
}

/** One row's worth of a change. Positive quantities only; the caller knows the direction. */
export interface AllocationStep {
  inventoryId: string;
  quantity: number;
}

/** Unreserved stock in one row, floored at zero so bad data cannot invent stock. */
export function availableIn(row: InventoryRow): number {
  return Math.max(0, row.quantity - row.reserved);
}

/** Unreserved stock across every row for a variant. */
export function availableTotal(rows: InventoryRow[]): number {
  return rows.reduce((sum, row) => sum + availableIn(row), 0);
}

/**
 * How to reserve `quantity` units, deepest row first.
 *
 * Returns `[]` for an untracked variant (no rows), and `null` when the rows
 * exist but cannot cover the order — which is the caller's signal to abort the
 * whole transaction rather than partially reserve.
 */
export function planReservation(rows: InventoryRow[], quantity: number): AllocationStep[] | null {
  if (quantity <= 0) return [];
  if (rows.length === 0) return [];
  if (availableTotal(rows) < quantity) return null;

  const steps: AllocationStep[] = [];
  let remaining = quantity;

  for (const row of [...rows].sort((a, b) => availableIn(b) - availableIn(a))) {
    if (remaining === 0) break;
    const take = Math.min(availableIn(row), remaining);
    if (take <= 0) continue;
    steps.push({ inventoryId: row.id, quantity: take });
    remaining -= take;
  }

  return steps;
}

/**
 * How to give `quantity` reserved units back — used both to release a
 * cancelled order's hold and to commit a confirmed one, since both decrement
 * `reserved` and differ only in whether `quantity` moves with it.
 *
 * Drawn from the most-reserved row first, and never below zero. The rows this
 * plans against are read fresh, so they need not be the rows the original
 * reservation touched: per-location drift is possible, the global count stays
 * right, and only the global count decides whether the next order can be
 * accepted. Recording the original allocation per location would need a field
 * the §7 schema does not have.
 */
export function planRelease(rows: InventoryRow[], quantity: number): AllocationStep[] {
  if (quantity <= 0 || rows.length === 0) return [];

  const steps: AllocationStep[] = [];
  let remaining = quantity;

  for (const row of [...rows].sort((a, b) => b.reserved - a.reserved)) {
    if (remaining === 0) break;
    const give = Math.min(row.reserved, remaining);
    if (give <= 0) continue;
    steps.push({ inventoryId: row.id, quantity: give });
    remaining -= give;
  }

  return steps;
}

/**
 * Where to put `quantity` units back on the shelf — a cancelled order that had
 * already been committed, or a return. Goes to the deepest row, which is the
 * one most likely to be the warehouse rather than a district office.
 */
export function planRestock(rows: InventoryRow[], quantity: number): AllocationStep[] {
  if (quantity <= 0 || rows.length === 0) return [];
  const deepest = [...rows].sort((a, b) => b.quantity - a.quantity)[0];
  return [{ inventoryId: deepest.id, quantity }];
}

/** Physical units per variant across a set of order-item snapshots. */
export function unitsByVariant(
  items: Array<{ variantId: string | null; quantity: number }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.variantId) continue;
    counts.set(item.variantId, (counts.get(item.variantId) ?? 0) + item.quantity);
  }
  return counts;
}
