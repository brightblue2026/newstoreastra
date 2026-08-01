import { describe, expect, it } from 'vitest';
import type { Session } from 'next-auth';
import { authConfig } from './auth.config';
import { UserRole } from '@/lib/roles';

/**
 * The middleware layer of the /admin guard. This is layer one of three — the
 * admin layout and every server action check again via `@/lib/session`.
 */
const authorized = authConfig.callbacks.authorized;

function request(pathname: string) {
  return { nextUrl: new URL(`https://brightblue.in${pathname}`) } as Parameters<
    typeof authorized
  >[0]['request'];
}

function session(role: UserRole, isActive = true): Session {
  return {
    user: { id: 'u1', role, isActive, name: 'Test', email: 'test@brightblue.in' },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as Session;
}

describe('the Phase 0 acceptance criterion', () => {
  it('rejects a CUSTOMER from /admin', () => {
    expect(authorized({ auth: session(UserRole.CUSTOMER), request: request('/admin') })).toBe(
      false,
    );
  });

  it('admits an ADMIN to /admin', () => {
    expect(authorized({ auth: session(UserRole.ADMIN), request: request('/admin') })).toBe(true);
  });
});

describe('the storefront', () => {
  it('is open to everyone, signed in or not', () => {
    for (const path of ['/', '/brand/mx-3', '/cart', '/checkout', '/api/webhooks/razorpay']) {
      expect(authorized({ auth: null, request: request(path) })).toBe(true);
    }
  });
});

describe('/admin', () => {
  it('turns away an anonymous visitor', () => {
    expect(authorized({ auth: null, request: request('/admin') })).toBe(false);
    expect(authorized({ auth: null, request: request('/admin/products') })).toBe(false);
  });

  it('keeps the login page reachable while signed out', () => {
    expect(authorized({ auth: null, request: request('/admin/login') })).toBe(true);
  });

  it('admits STAFF, MANAGER and ADMIN', () => {
    for (const role of [UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN]) {
      expect(authorized({ auth: session(role), request: request('/admin') })).toBe(true);
    }
  });

  it('turns away a deactivated account whatever its role', () => {
    for (const role of [UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN]) {
      expect(authorized({ auth: session(role, false), request: request('/admin') })).toBe(false);
    }
  });

  it('guards nested admin routes, not just the index', () => {
    for (const path of ['/admin/products', '/admin/orders/BB-2627-00001', '/admin/settings']) {
      expect(authorized({ auth: session(UserRole.CUSTOMER), request: request(path) })).toBe(false);
      expect(authorized({ auth: session(UserRole.MANAGER), request: request(path) })).toBe(true);
    }
  });
});

describe('session strategy', () => {
  it('uses JWT — credentials and phone OTP both require it', () => {
    expect(authConfig.session.strategy).toBe('jwt');
  });

  it('sends unauthenticated staff to the staff sign-in page', () => {
    expect(authConfig.pages.signIn).toBe('/admin/login');
  });
});
