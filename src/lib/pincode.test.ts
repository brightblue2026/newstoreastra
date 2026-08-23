import { describe, expect, it } from 'vitest';
import { resolveState } from './gst';
import {
  allMappedStates,
  isValidPincode,
  normalisePincode,
  resolveDeliveryState,
  resolvePincode,
} from './pincode';

describe('isValidPincode', () => {
  it('accepts six digits starting 1–9', () => {
    expect(isValidPincode('682035')).toBe(true);
    expect(isValidPincode(' 682035 ')).toBe(true);
  });

  it('rejects a leading zero, wrong lengths and non-digits', () => {
    expect(isValidPincode('082035')).toBe(false);
    expect(isValidPincode('68203')).toBe(false);
    expect(isValidPincode('6820355')).toBe(false);
    expect(isValidPincode('68203a')).toBe(false);
  });
});

describe('normalisePincode', () => {
  it('keeps the digits of a spaced or hyphenated pincode', () => {
    expect(normalisePincode('682 035')).toBe('682035');
    expect(normalisePincode('682-035')).toBe('682035');
  });
});

describe('resolvePincode', () => {
  it('resolves BBTC’s own Ernakulam pincode to Kerala', () => {
    expect(resolvePincode('682035')).toEqual({ kind: 'state', state: 'Kerala' });
  });

  it('resolves each unique series it claims', () => {
    const cases: Array<[string, string]> = [
      ['110001', 'Delhi'],
      ['160017', 'Chandigarh'],
      ['400001', 'Maharashtra'],
      ['403001', 'Goa'],
      ['500001', 'Telangana'],
      ['560001', 'Karnataka'],
      ['600001', 'Tamil Nadu'],
      ['673001', 'Kerala'],
      ['695001', 'Kerala'],
      ['700001', 'West Bengal'],
      ['781001', 'Assam'],
      ['800001', 'Bihar'],
      ['834001', 'Jharkhand'],
    ];
    for (const [pincode, state] of cases) {
      expect(resolvePincode(pincode), pincode).toEqual({ kind: 'state', state });
    }
  });

  it('prefers a longer prefix, so a union territory inside a state series stays itself', () => {
    // The whole point of the longest-prefix rule: these all sit inside a
    // neighbouring state's two-digit series and are not that state.
    expect(resolvePincode('682555')).toEqual({ kind: 'state', state: 'Lakshadweep' });
    expect(resolvePincode('673310')).toEqual({ kind: 'state', state: 'Puducherry' });
    expect(resolvePincode('533464')).toEqual({ kind: 'state', state: 'Puducherry' });
    expect(resolvePincode('737101')).toEqual({ kind: 'state', state: 'Sikkim' });
    expect(resolvePincode('744101')).toEqual({
      kind: 'state',
      state: 'Andaman and Nicobar Islands',
    });
  });

  it('reports a shared series as ambiguous rather than guessing', () => {
    expect(resolvePincode('248001')).toEqual({
      kind: 'ambiguous',
      candidates: ['Uttar Pradesh', 'Uttarakhand'],
    });
    expect(resolvePincode('814112')).toEqual({
      kind: 'ambiguous',
      candidates: ['Bihar', 'Jharkhand'],
    });
    expect(resolvePincode('605001')).toEqual({
      kind: 'ambiguous',
      candidates: ['Tamil Nadu', 'Puducherry'],
    });
  });

  it('reports an unlisted series as unknown, not as a nearby state', () => {
    expect(resolvePincode('999999')).toEqual({ kind: 'unknown' });
  });

  it('reports a malformed pincode as invalid', () => {
    expect(resolvePincode('12')).toEqual({ kind: 'invalid' });
  });

  it('names only states gst.ts can resolve', () => {
    // A typo in the table would silently become an inter-state supply, because
    // `isIntraStateSupply` treats an unrecognised state as inter-state.
    for (const state of allMappedStates()) {
      expect(resolveState(state), state).toBe(state);
    }
  });
});

describe('resolveDeliveryState', () => {
  it('lets a definite pincode overrule the selected state', () => {
    // Selecting Kerala for a Bengaluru pincode would turn an IGST order into a
    // CGST + SGST one. The pincode wins.
    expect(resolveDeliveryState('560001', 'Kerala')).toEqual({ state: 'Karnataka' });
  });

  it('accepts the selection when the series is shared', () => {
    expect(resolveDeliveryState('248001', 'Uttarakhand')).toEqual({ state: 'Uttarakhand' });
  });

  it('rejects a selection that is not in the shared series', () => {
    const result = resolveDeliveryState('248001', 'Kerala');
    expect('error' in result).toBe(true);
  });

  it('accepts any real state for an unlisted series', () => {
    expect(resolveDeliveryState('999999', 'Kerala')).toEqual({ state: 'Kerala' });
  });

  it('requires a state when the series is unlisted and nothing was selected', () => {
    expect(resolveDeliveryState('999999', '')).toEqual({ error: 'Choose the delivery state.' });
  });

  it('rejects a malformed pincode before looking at the state', () => {
    expect(resolveDeliveryState('68', 'Kerala')).toEqual({ error: 'Enter a six-digit pincode.' });
  });
});
