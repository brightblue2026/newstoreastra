import { canAdminister, canHandleOrders, canManageCatalogue, canSeePricing } from '@/lib/roles';
import type { UserRole } from '@/generated/prisma/client';

/**
 * The admin sidebar, in one place.
 *
 * Kept out of the layout component so the same list drives the desktop rail,
 * the mobile drawer and the dashboard, and so a section can never appear in one
 * and be missing from another.
 *
 * Role gating here only decides what is *shown*. Every page behind these links
 * calls its own `require*Access` guard and every action re-checks — hiding a
 * link is not access control.
 */

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export function navFor(role: UserRole): NavGroup[] {
  const groups: NavGroup[] = [{ title: 'Overview', items: [{ href: '/admin', label: 'Dashboard' }] }];

  if (canHandleOrders(role)) {
    const selling = [{ href: '/admin/orders', label: 'Orders' }];
    // Reports are money, and STAFF are kept away from pricing — the page itself
    // calls `requirePricingAccess`, so the link follows the same rule.
    if (canSeePricing(role)) selling.push({ href: '/admin/reports', label: 'Reports' });
    groups.push({ title: 'Selling', items: selling });
  }

  if (canManageCatalogue(role)) {
    groups.push({
      title: 'Catalogue',
      items: [
        { href: '/admin/products', label: 'Products' },
        { href: '/admin/inventory', label: 'Stock' },
        { href: '/admin/combos', label: 'Combos' },
        { href: '/admin/discounts', label: 'Offers' },
        { href: '/admin/brands', label: 'Brands' },
        { href: '/admin/categories', label: 'Categories' },
        { href: '/admin/reviews', label: 'Reviews' },
      ],
    });
    groups.push({
      title: 'Shopfront',
      items: [
        { href: '/admin/content', label: 'Content and policies' },
        { href: '/admin/retailers', label: 'Retailers' },
      ],
    });
  }

  if (canAdminister(role)) {
    groups.push({ title: 'Admin', items: [{ href: '/admin/settings', label: 'Settings' }] });
  }

  return groups;
}

/**
 * Whether a nav link should read as the current page.
 *
 * `/admin` is matched exactly — as a prefix it would light up on every page in
 * the panel. Everything else matches its own subtree, so `/admin/products/new`
 * still highlights Products.
 */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}
