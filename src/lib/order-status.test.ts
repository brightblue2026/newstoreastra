import { describe, expect, it } from 'vitest';
import {
  OrderStatus,
  canTransition,
  inventoryEffect,
  isLegalTransition,
  staffTransitions,
} from './order-status';

describe('canTransition', () => {
  it('lets only a verified webhook confirm a payment', () => {
    // Brief §10: never trust the client-side success handler to change order
    // state. Nothing but the webhook can make this move, including the admin.
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED, 'WEBHOOK')).toBe(true);
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED, 'STAFF')).toBe(false);
  });

  it('lets staff cancel an unpaid order', () => {
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, 'STAFF')).toBe(true);
  });

  it('walks fulfilment forward one step at a time', () => {
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.PACKED, 'STAFF')).toBe(true);
    expect(canTransition(OrderStatus.PACKED, OrderStatus.SHIPPED, 'STAFF')).toBe(true);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED, 'STAFF')).toBe(true);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.SHIPPED, 'STAFF')).toBe(false);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.DELIVERED, 'STAFF')).toBe(false);
  });

  it('refuses to move backwards', () => {
    expect(isLegalTransition(OrderStatus.SHIPPED, OrderStatus.PACKED)).toBe(false);
    expect(isLegalTransition(OrderStatus.DELIVERED, OrderStatus.CONFIRMED)).toBe(false);
  });

  it('refuses to cancel something already shipped', () => {
    // A shipped parcel comes back as a return, not a cancellation.
    expect(isLegalTransition(OrderStatus.SHIPPED, OrderStatus.CANCELLED)).toBe(false);
    expect(isLegalTransition(OrderStatus.SHIPPED, OrderStatus.RETURNED)).toBe(true);
  });

  it('treats REFUNDED as terminal', () => {
    expect(staffTransitions(OrderStatus.REFUNDED)).toEqual([]);
  });

  it('offers refund only after a cancellation or a return', () => {
    expect(staffTransitions(OrderStatus.CANCELLED)).toEqual([OrderStatus.REFUNDED]);
    expect(staffTransitions(OrderStatus.RETURNED)).toEqual([OrderStatus.REFUNDED]);
  });

  it('offers staff no way to confirm an unpaid order', () => {
    expect(staffTransitions(OrderStatus.PENDING_PAYMENT)).toEqual([OrderStatus.CANCELLED]);
  });
});

describe('inventoryEffect', () => {
  it('commits the hold when payment confirms', () => {
    expect(inventoryEffect(OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED)).toBe('commit');
  });

  it('releases the hold — and does not restock — when an unpaid order is cancelled', () => {
    // Nothing was ever decremented, so restocking here would invent stock.
    expect(inventoryEffect(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED)).toBe('release');
  });

  it('restocks when a confirmed or packed order is cancelled', () => {
    expect(inventoryEffect(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe('restock');
    expect(inventoryEffect(OrderStatus.PACKED, OrderStatus.CANCELLED)).toBe('restock');
  });

  it('restocks a return', () => {
    expect(inventoryEffect(OrderStatus.SHIPPED, OrderStatus.RETURNED)).toBe('restock');
    expect(inventoryEffect(OrderStatus.DELIVERED, OrderStatus.RETURNED)).toBe('restock');
  });

  it('leaves stock alone for a fulfilment step or a refund', () => {
    expect(inventoryEffect(OrderStatus.CONFIRMED, OrderStatus.PACKED)).toBe('none');
    expect(inventoryEffect(OrderStatus.PACKED, OrderStatus.SHIPPED)).toBe('none');
    expect(inventoryEffect(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe('none');
    // The stock came back when it was cancelled or returned, not again now.
    expect(inventoryEffect(OrderStatus.CANCELLED, OrderStatus.REFUNDED)).toBe('none');
    expect(inventoryEffect(OrderStatus.RETURNED, OrderStatus.REFUNDED)).toBe('none');
  });
});
