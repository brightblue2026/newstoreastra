import { describe, expect, it } from 'vitest';
import { UserRole } from '@/generated/prisma/client';
import { isCurrent, navFor } from './nav';

function hrefs(role: UserRole): string[] {
  return navFor(role).flatMap((group) => group.items.map((item) => item.href));
}

describe('navFor', () => {
  it('gives staff orders but not the catalogue', () => {
    const links = hrefs(UserRole.STAFF);
    expect(links).toContain('/admin/orders');
    expect(links).not.toContain('/admin/products');
    expect(links).not.toContain('/admin/inventory');
    expect(links).not.toContain('/admin/settings');
  });

  it('gives a manager the catalogue and stock, but not settings', () => {
    const links = hrefs(UserRole.MANAGER);
    expect(links).toContain('/admin/products');
    expect(links).toContain('/admin/inventory');
    expect(links).not.toContain('/admin/settings');
  });

  it('gives an administrator everything', () => {
    const links = hrefs(UserRole.ADMIN);
    expect(links).toContain('/admin/orders');
    expect(links).toContain('/admin/inventory');
    expect(links).toContain('/admin/settings');
  });

  it('always starts at the dashboard', () => {
    for (const role of [UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN]) {
      expect(hrefs(role)[0]).toBe('/admin');
    }
  });

  it('never lists the same destination twice', () => {
    const links = hrefs(UserRole.ADMIN);
    expect(new Set(links).size).toBe(links.length);
  });
});

describe('isCurrent', () => {
  it('matches the dashboard only exactly', () => {
    expect(isCurrent('/admin', '/admin')).toBe(true);
    expect(isCurrent('/admin', '/admin/products')).toBe(false);
  });

  it('matches a section from anywhere inside it', () => {
    expect(isCurrent('/admin/products', '/admin/products')).toBe(true);
    expect(isCurrent('/admin/products', '/admin/products/quick-add')).toBe(true);
    expect(isCurrent('/admin/products', '/admin/products/abc123/images')).toBe(true);
  });

  it('does not match a different section that merely shares a prefix', () => {
    expect(isCurrent('/admin/product', '/admin/products')).toBe(false);
    expect(isCurrent('/admin/orders', '/admin/products')).toBe(false);
  });
});

describe('reports in the nav', () => {
  it('is hidden from staff, who cannot see pricing', () => {
    expect(hrefs(UserRole.STAFF)).not.toContain('/admin/reports');
  });

  it('is shown to a manager and an administrator', () => {
    expect(hrefs(UserRole.MANAGER)).toContain('/admin/reports');
    expect(hrefs(UserRole.ADMIN)).toContain('/admin/reports');
  });
});

describe('reviews in the nav', () => {
  it('sits with the catalogue, for a manager and above', () => {
    expect(hrefs(UserRole.MANAGER)).toContain('/admin/reviews');
    expect(hrefs(UserRole.ADMIN)).toContain('/admin/reviews');
  });

  it('is hidden from staff', () => {
    expect(hrefs(UserRole.STAFF)).not.toContain('/admin/reviews');
  });
});
