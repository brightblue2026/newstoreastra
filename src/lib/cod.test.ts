import { describe, expect, it } from 'vitest';
import { checkCodEligibility, type CodSettings } from './cod';

const BASE_SETTINGS: CodSettings = {
  enabled: true,
  feePaise: 2_500,
  minOrderPaise: 20_000,
  maxOrderPaise: 500_000,
  pincodeAllowlist: ['67', '68', '69'], // Kerala-and-adjacent
};

describe('checkCodEligibility', () => {
  it('is eligible with the flat fee inside every bound', () => {
    const result = checkCodEligibility(BASE_SETTINGS, { subtotalPaise: 100_000, pincode: '682001' });
    expect(result).toEqual({ eligible: true, feePaise: 2_500 });
  });

  it('is ineligible when the global toggle is off', () => {
    const result = checkCodEligibility(
      { ...BASE_SETTINGS, enabled: false },
      { subtotalPaise: 100_000, pincode: '682001' },
    );
    expect(result.eligible).toBe(false);
  });

  it('rejects a pincode outside the allowlist', () => {
    const result = checkCodEligibility(BASE_SETTINGS, { subtotalPaise: 100_000, pincode: '110001' });
    expect(result.eligible).toBe(false);
    expect(result.feePaise).toBe(0);
  });

  it('allows every pincode when the allowlist is empty', () => {
    const result = checkCodEligibility(
      { ...BASE_SETTINGS, pincodeAllowlist: [] },
      { subtotalPaise: 100_000, pincode: '110001' },
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects below the minimum order value', () => {
    const result = checkCodEligibility(BASE_SETTINGS, { subtotalPaise: 19_999, pincode: '682001' });
    expect(result.eligible).toBe(false);
  });

  it('is eligible exactly at the minimum order value', () => {
    const result = checkCodEligibility(BASE_SETTINGS, { subtotalPaise: 20_000, pincode: '682001' });
    expect(result.eligible).toBe(true);
  });

  it('rejects above the maximum order value', () => {
    const result = checkCodEligibility(BASE_SETTINGS, { subtotalPaise: 500_001, pincode: '682001' });
    expect(result.eligible).toBe(false);
  });

  it('is eligible exactly at the maximum order value', () => {
    const result = checkCodEligibility(BASE_SETTINGS, { subtotalPaise: 500_000, pincode: '682001' });
    expect(result.eligible).toBe(true);
  });

  it('never returns a fee for an ineligible cart', () => {
    const result = checkCodEligibility(BASE_SETTINGS, { subtotalPaise: 1, pincode: '682001' });
    expect(result.eligible).toBe(false);
    expect(result.feePaise).toBe(0);
  });
});
