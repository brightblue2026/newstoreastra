import { describe, expect, it } from 'vitest';
import {
  availableTotal,
  planRelease,
  planReservation,
  planRestock,
  unitsByVariant,
  type InventoryRow,
} from './inventory';

const row = (id: string, quantity: number, reserved = 0): InventoryRow => ({
  id,
  quantity,
  reserved,
});

describe('planReservation', () => {
  it('takes from the deepest row first', () => {
    const steps = planReservation([row('a', 5), row('b', 20)], 6);
    expect(steps).toEqual([{ inventoryId: 'b', quantity: 6 }]);
  });

  it('spreads across rows when no single one can cover it', () => {
    const steps = planReservation([row('a', 5), row('b', 20)], 24);
    expect(steps).toEqual([
      { inventoryId: 'b', quantity: 20 },
      { inventoryId: 'a', quantity: 4 },
    ]);
  });

  it('counts already-reserved units as unavailable', () => {
    expect(availableTotal([row('a', 10, 8)])).toBe(2);
    expect(planReservation([row('a', 10, 8)], 3)).toBeNull();
    expect(planReservation([row('a', 10, 8)], 2)).toEqual([{ inventoryId: 'a', quantity: 2 }]);
  });

  it('refuses rather than partially reserving when stock is short', () => {
    expect(planReservation([row('a', 2), row('b', 1)], 4)).toBeNull();
  });

  it('refuses untracked inventory, including a forged cart', () => {
    expect(planReservation([], 3)).toBeNull();
  });

  it('never invents stock from a negative available count', () => {
    expect(availableTotal([row('a', 5, 9)])).toBe(0);
    expect(planReservation([row('a', 5, 9)], 1)).toBeNull();
  });
});

describe('planRelease', () => {
  it('gives back from the most-reserved row first', () => {
    const steps = planRelease([row('a', 10, 2), row('b', 10, 7)], 8);
    expect(steps).toEqual([
      { inventoryId: 'b', quantity: 7 },
      { inventoryId: 'a', quantity: 1 },
    ]);
  });

  it('never drives reserved below zero', () => {
    expect(planRelease([row('a', 10, 1)], 5)).toEqual([{ inventoryId: 'a', quantity: 1 }]);
  });

  it('does nothing for an untracked variant', () => {
    expect(planRelease([], 3)).toEqual([]);
  });
});

describe('planRestock', () => {
  it('puts returned stock into the deepest row', () => {
    expect(planRestock([row('a', 3), row('b', 40)], 2)).toEqual([
      { inventoryId: 'b', quantity: 2 },
    ]);
  });

  it('does nothing for an untracked variant', () => {
    expect(planRestock([], 2)).toEqual([]);
  });
});

describe('unitsByVariant', () => {
  it('sums the same variant across separate order items', () => {
    // A combo component and a loose bottle of the same fragrance are two
    // snapshots and one variant to reserve.
    const counts = unitsByVariant([
      { variantId: 'v1', quantity: 2 },
      { variantId: 'v1', quantity: 3 },
      { variantId: 'v2', quantity: 1 },
      { variantId: null, quantity: 9 },
    ]);
    expect(counts.get('v1')).toBe(5);
    expect(counts.get('v2')).toBe(1);
    expect(counts.size).toBe(2);
  });
});
