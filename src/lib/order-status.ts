/**
 * The order state machine, and who is allowed to move it.
 *
 * The rule that matters most is brief §10: "Never trust the client-side success
 * handler to change order state." That is enforced here rather than in the
 * route handler — `PENDING_PAYMENT → CONFIRMED` is reachable only by
 * `'WEBHOOK'`, so no admin screen, server action or client callback can confirm
 * a payment that Razorpay has not signed for. A COD order never passes through
 * `PENDING_PAYMENT` at all; it is created `CONFIRMED`, because there is no
 * payment to wait for.
 *
 * Pure, so every transition can be tested without a database.
 */

import { OrderStatus } from '@/generated/prisma/enums';

export { OrderStatus };

export type TransitionActor = 'WEBHOOK' | 'STAFF';

/** Every transition the business allows, whoever performs it. */
const FLOW: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
  [OrderStatus.CANCELLED]: [OrderStatus.REFUNDED],
  [OrderStatus.RETURNED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
});

/**
 * Transitions only a verified webhook may make. Payment confirmation is the
 * whole list, and it is the whole point of the list.
 */
const WEBHOOK_ONLY: ReadonlySet<string> = new Set([
  `${OrderStatus.PENDING_PAYMENT}→${OrderStatus.CONFIRMED}`,
]);

export function isLegalTransition(from: OrderStatus, to: OrderStatus): boolean {
  return FLOW[from].includes(to);
}

/** True when `actor` may move an order from `from` to `to`. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
): boolean {
  if (!isLegalTransition(from, to)) return false;
  if (actor === 'WEBHOOK') return true;
  return !WEBHOOK_ONLY.has(`${from}→${to}`);
}

/** The transitions to offer as buttons on the admin order detail. */
export function staffTransitions(from: OrderStatus): OrderStatus[] {
  return FLOW[from].filter((to) => canTransition(from, to, 'STAFF'));
}

/**
 * What a transition does to stock.
 *
 *   - `commit`  — the hold becomes a real decrement: `reserved--`, `quantity--`.
 *   - `release` — the hold goes away and nothing was ever taken: `reserved--`.
 *   - `restock` — units already decremented come back: `quantity++`.
 *
 * A cancellation before payment only ever *released* a hold, so it must not
 * restock; a cancellation after confirmation had already decremented, so it
 * must. Getting these two the wrong way round is how stock counts drift, which
 * is why this is a named function with its own tests rather than an `if` inside
 * the transaction.
 */
export type InventoryEffect = 'commit' | 'release' | 'restock' | 'none';

export function inventoryEffect(from: OrderStatus, to: OrderStatus): InventoryEffect {
  if (from === OrderStatus.PENDING_PAYMENT && to === OrderStatus.CONFIRMED) return 'commit';
  if (from === OrderStatus.PENDING_PAYMENT && to === OrderStatus.CANCELLED) return 'release';
  if (to === OrderStatus.CANCELLED || to === OrderStatus.RETURNED) return 'restock';
  return 'none';
}

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: 'Awaiting payment',
  [OrderStatus.CONFIRMED]: 'Confirmed',
  [OrderStatus.PACKED]: 'Packed',
  [OrderStatus.SHIPPED]: 'Shipped',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.RETURNED]: 'Returned',
  [OrderStatus.REFUNDED]: 'Refunded',
});
