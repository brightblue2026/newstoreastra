import { describe, expect, it } from 'vitest';
import {
  ROLE_LABELS,
  UserRole,
  canAccessAdmin,
  canAdminister,
  canHandleOrders,
  canManageCatalogue,
  canSeePricing,
  hasAtLeast,
} from './roles';

const ALL_ROLES = [
  UserRole.CUSTOMER,
  UserRole.STAFF,
  UserRole.MANAGER,
  UserRole.ADMIN,
] as const;

describe('the Phase 0 acceptance criterion', () => {
  it('rejects CUSTOMER from the admin panel', () => {
    expect(canAccessAdmin(UserRole.CUSTOMER)).toBe(false);
  });

  it('rejects an absent session — GUEST is the absence of a role', () => {
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin(undefined)).toBe(false);
  });

  it('admits ADMIN', () => {
    expect(canAccessAdmin(UserRole.ADMIN)).toBe(true);
  });
});

describe('the role ladder', () => {
  it('lets every role do what the one beneath it can', () => {
    expect(hasAtLeast(UserRole.ADMIN, UserRole.MANAGER)).toBe(true);
    expect(hasAtLeast(UserRole.ADMIN, UserRole.STAFF)).toBe(true);
    expect(hasAtLeast(UserRole.MANAGER, UserRole.STAFF)).toBe(true);
    expect(hasAtLeast(UserRole.STAFF, UserRole.CUSTOMER)).toBe(true);
  });

  it('does not let a role do what the one above it can', () => {
    expect(hasAtLeast(UserRole.STAFF, UserRole.MANAGER)).toBe(false);
    expect(hasAtLeast(UserRole.MANAGER, UserRole.ADMIN)).toBe(false);
    expect(hasAtLeast(UserRole.CUSTOMER, UserRole.STAFF)).toBe(false);
  });

  it('treats every role as meeting its own bar', () => {
    for (const role of ALL_ROLES) {
      expect(hasAtLeast(role, role)).toBe(true);
    }
  });
});

describe('admin panel access', () => {
  it('admits STAFF and above', () => {
    expect(canAccessAdmin(UserRole.STAFF)).toBe(true);
    expect(canAccessAdmin(UserRole.MANAGER)).toBe(true);
    expect(canAccessAdmin(UserRole.ADMIN)).toBe(true);
  });
});

describe('STAFF must not see or change prices', () => {
  // §6 is emphatic about this: STAFF handles orders and fulfilment, and
  // nothing to do with money or the catalogue.
  it('denies STAFF pricing', () => {
    expect(canSeePricing(UserRole.STAFF)).toBe(false);
  });

  it('denies STAFF the catalogue', () => {
    expect(canManageCatalogue(UserRole.STAFF)).toBe(false);
  });

  it('still lets STAFF handle orders', () => {
    expect(canHandleOrders(UserRole.STAFF)).toBe(true);
  });

  it('grants MANAGER and ADMIN pricing and catalogue', () => {
    for (const role of [UserRole.MANAGER, UserRole.ADMIN]) {
      expect(canSeePricing(role)).toBe(true);
      expect(canManageCatalogue(role)).toBe(true);
    }
  });
});

describe('administrator-only capabilities', () => {
  it('restricts user management, settings and the audit log to ADMIN', () => {
    expect(canAdminister(UserRole.ADMIN)).toBe(true);
    expect(canAdminister(UserRole.MANAGER)).toBe(false);
    expect(canAdminister(UserRole.STAFF)).toBe(false);
    expect(canAdminister(UserRole.CUSTOMER)).toBe(false);
  });
});

describe('every capability check', () => {
  const checks = [
    canAccessAdmin,
    canSeePricing,
    canManageCatalogue,
    canAdminister,
    canHandleOrders,
  ];

  it('denies a missing role rather than defaulting open', () => {
    for (const check of checks) {
      expect(check(null)).toBe(false);
      expect(check(undefined)).toBe(false);
    }
  });

  it('denies CUSTOMER everything in the admin panel', () => {
    for (const check of checks) {
      expect(check(UserRole.CUSTOMER)).toBe(false);
    }
  });
});

describe('ROLE_LABELS', () => {
  it('names every role', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});
