import { forbidden, redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  UserRole,
  canAccessAdmin,
  canAdminister,
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

/** The signed-in user, or null. Never throws. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.role) return null;
  if (user.isActive === false) return null;

  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role,
    isActive: user.isActive,
  };
}

/**
 * Layers two and three of the /admin guard — the admin layout and every server
 * action call this.
 *
 * Middleware already turned anonymous requests away, but middleware can be
 * bypassed by anything that reaches a server action directly, and a role can
 * change after a token was issued. Every mutation re-checks here.
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

/** ADMIN only. Users, settings, financial reports, audit log. */
export async function requireAdministrator(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  if (!canAdminister(user.role)) forbidden();
  return user;
}
