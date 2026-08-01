import { UserRole } from '@/generated/prisma/enums';

export { UserRole };

/**
 * Roles — master brief §6.
 *
 * `GUEST` is not a stored role; it is the absence of a session. Everyone
 * signed in has one of the four below.
 *
 * The ordering is a ladder: every role can do everything the one beneath it
 * can. The one place this is not a simple ladder is pricing — STAFF sits above
 * CUSTOMER for order handling but must never see or change prices, products or
 * discounts. That is `canSeePricing`, not a rung.
 */
const RANK: Record<UserRole, number> = {
  [UserRole.CUSTOMER]: 0,
  [UserRole.STAFF]: 1,
  [UserRole.MANAGER]: 2,
  [UserRole.ADMIN]: 3,
};

/** True when `role` is at least `minimum` on the ladder. */
export function hasAtLeast(role: UserRole | null | undefined, minimum: UserRole): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[minimum];
}

/** True for any role that may open the admin panel at all. */
export function canAccessAdmin(role: UserRole | null | undefined): boolean {
  return hasAtLeast(role, UserRole.STAFF);
}

/**
 * True for roles that may see or change prices, products, variants, combos and
 * discounts. Explicitly false for STAFF — §6 is emphatic about it.
 */
export function canSeePricing(role: UserRole | null | undefined): boolean {
  return hasAtLeast(role, UserRole.MANAGER);
}

/** True for roles that may create or edit catalogue content. */
export function canManageCatalogue(role: UserRole | null | undefined): boolean {
  return hasAtLeast(role, UserRole.MANAGER);
}

/** True for user management, settings, financial reports and the audit log. */
export function canAdminister(role: UserRole | null | undefined): boolean {
  return hasAtLeast(role, UserRole.ADMIN);
}

/** True for viewing orders and updating fulfilment. */
export function canHandleOrders(role: UserRole | null | undefined): boolean {
  return hasAtLeast(role, UserRole.STAFF);
}

/** Human-readable role name, for the admin header and the user list. */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.CUSTOMER]: 'Customer',
  [UserRole.STAFF]: 'Staff',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.ADMIN]: 'Administrator',
};
