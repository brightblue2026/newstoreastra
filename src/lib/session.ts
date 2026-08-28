import { forbidden, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  UserRole,
  canAccessAdmin,
  canAdminister,
  canHandleOrders,
  canManageCatalogue,
  canSeePricing,
  hasAtLeast,
} from '@/lib/roles';

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  isActive: boolean;
}

/**
 * The signed-in user, or null. Never throws.
 *
 * `role` and `isActive` are re-read from `User` on every call rather than
 * trusted from the JWT. The token only carries what was true at sign-in
 * (`auth.config.ts`'s `jwt` callback writes them once, and the session lasts
 * `maxAge: 60*60*12`), so without this a demotion or deactivation had no
 * effect on an already-issued session for up to twelve hours — every guard
 * in this file re-checked the same stale token, not the database, despite
 * this function's own history claiming otherwise. One indexed lookup on an
 * id already known from a verified session; admin traffic doesn't need a
 * cache for this.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const tokenUser = session?.user;
  if (!tokenUser?.id || !tokenUser.role) return null;

  const row = await db.user.findUnique({
    where: { id: tokenUser.id },
    select: { name: true, email: true, role: true, isActive: true },
  });
  if (!row || !row.isActive) return null;

  return {
    id: tokenUser.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
  };
}

/**
 * Layers two and three of the /admin guard — the admin layout and every server
 * action call this.
 *
 * Middleware already turned anonymous requests away, but middleware can be
 * bypassed by anything that reaches a server action directly, and a role can
 * change after a token was issued. Every mutation re-checks here — against
 * the database, via `currentUser()`, not just the token the middleware layer
 * already trusted.
 */
export async function requireRole(minimum: UserRole): Promise<SessionUser> {
  const user = await currentUser();

  if (!user) {
    redirect('/admin/login');
  }
  if (!hasAtLeast(user.role, minimum)) {
    // 403, not a redirect — the user is signed in, just not permitted.
    forbidden();
  }

  return user;
}

/** STAFF and above. Opens the admin panel. */
export async function requireAdminAccess(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  if (!canAccessAdmin(user.role)) forbidden();
  return user;
}

/** MANAGER and above. Products, variants, combos, discounts, inventory. */
export async function requireCatalogueAccess(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  if (!canManageCatalogue(user.role)) forbidden();
  return user;
}

/** MANAGER and above. Anything that reads or writes a price. */
export async function requirePricingAccess(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  if (!canSeePricing(user.role)) forbidden();
  return user;
}

/** STAFF and above. Viewing orders and updating fulfilment — §6. */
export async function requireOrderAccess(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  if (!canHandleOrders(user.role)) forbidden();
  return user;
}

/** ADMIN only. Users, settings, financial reports, audit log. */
export async function requireAdministrator(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  if (!canAdminister(user.role)) forbidden();
  return user;
}
