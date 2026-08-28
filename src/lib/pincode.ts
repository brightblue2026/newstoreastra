/**
 * Pincode → state, offline.
 *
 * Brief §12 Phase 5 asks for "pincode auto-fill, serviceability, COD
 * availability". Auto-fill of *city* needs a real pincode database and is
 * Phase 6's Shiprocket lookup. The state, though, cannot wait for a third
 * party and must never depend on one: the delivery state decides CGST + SGST
 * versus IGST, so getting it from a service that might be down or wrong would
 * put a tax decision behind someone else's uptime. This table is local.
 *
 * The honesty rule here matters more than coverage. A wrong state charges the
 * wrong tax; an unknown state costs the customer one dropdown. So a prefix
 * resolves to a state only where the whole series belongs to one state.
 * Where two states share a series — Uttar Pradesh and Uttarakhand at 24 and
 * 26, Bihar and Jharkhand at 81 and 82 — the result is `ambiguous` with the
 * candidates named, and the customer picks. Anything not listed is `unknown`,
 * and the customer's own choice stands.
 *
 * Longer prefixes win over shorter ones, which is how the union territories
 * that sit inside a state's series stay correct: Goa's 403 inside
 * Maharashtra's 40, Sikkim's 737 and the Andamans' 744 inside West Bengal's
 * 73/74, Lakshadweep's 68255x and Mahé's 673310 inside Kerala's own series.
 * Those blocks are the reason "68 is Kerala" is not good enough for tax.
 *
 * Every state name here is a canonical name from `STATE_CODES` in `gst.ts`;
 * `assertKnownStates` below fails the test suite if one ever drifts.
 */

import { resolveState } from './gst';

export type PincodeResolution =
  | { kind: 'state'; state: string }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'unknown' }
  | { kind: 'invalid' };

/**
 * Prefix → the single state that owns the whole series.
 *
 * Keyed by prefix length so a 6-digit block can override a 2-digit series.
 * Sources: India Post's postal circle allocation. Kept to series this can
 * stand behind; see the module note on why the gaps are deliberate.
 */
const DEFINITE: Readonly<Record<string, string>> = Object.freeze({
  // ---- North ----
  '11': 'Delhi',
  '12': 'Haryana',
  '13': 'Haryana',
  '14': 'Punjab',
  '15': 'Punjab',
  '160': 'Chandigarh',
  '17': 'Himachal Pradesh',
  '18': 'Jammu and Kashmir',
  // ---- Uttar Pradesh (24 and 26 shared with Uttarakhand — see AMBIGUOUS) ----
  '20': 'Uttar Pradesh',
  '21': 'Uttar Pradesh',
  '22': 'Uttar Pradesh',
  '23': 'Uttar Pradesh',
  '25': 'Uttar Pradesh',
  '27': 'Uttar Pradesh',
  '28': 'Uttar Pradesh',
  // ---- West ----
  '30': 'Rajasthan',
  '31': 'Rajasthan',
  '32': 'Rajasthan',
  '33': 'Rajasthan',
  '34': 'Rajasthan',
  '36': 'Gujarat',
  '37': 'Gujarat',
  '38': 'Gujarat',
  '39': 'Gujarat',
  '40': 'Maharashtra',
  '403': 'Goa',
  '41': 'Maharashtra',
  '42': 'Maharashtra',
  '43': 'Maharashtra',
  '44': 'Maharashtra',
  '45': 'Madhya Pradesh',
  '46': 'Madhya Pradesh',
  '47': 'Madhya Pradesh',
  '48': 'Madhya Pradesh',
  '49': 'Chhattisgarh',
  // ---- South ----
  '50': 'Telangana',
  '51': 'Andhra Pradesh',
  '52': 'Andhra Pradesh',
  '53': 'Andhra Pradesh',
  '533464': 'Puducherry', // Yanam, inside Andhra Pradesh's 533 series
  '56': 'Karnataka',
  '57': 'Karnataka',
  '58': 'Karnataka',
  '59': 'Karnataka',
  '60': 'Tamil Nadu',
  '61': 'Tamil Nadu',
  '62': 'Tamil Nadu',
  '63': 'Tamil Nadu',
  '64': 'Tamil Nadu',
  '67': 'Kerala',
  '673310': 'Puducherry', // Mahé, inside Kerala's 673 series
  '68': 'Kerala',
  '682551': 'Lakshadweep', // Androth
  '682552': 'Lakshadweep', // Amini
  '682553': 'Lakshadweep', // Agatti
  '682554': 'Lakshadweep', // Kadmat
  '682555': 'Lakshadweep', // Kavaratti
  '682556': 'Lakshadweep', // Kalpeni
  '682557': 'Lakshadweep', // Kiltan
  '682558': 'Lakshadweep', // Chetlat
  '682559': 'Lakshadweep', // Minicoy
  '69': 'Kerala',
  // ---- East and North East ----
  '70': 'West Bengal',
  '71': 'West Bengal',
  '72': 'West Bengal',
  '73': 'West Bengal',
  '737': 'Sikkim',
  '74': 'West Bengal',
  '744': 'Andaman and Nicobar Islands',
  '75': 'Odisha',
  '76': 'Odisha',
  '77': 'Odisha',
  '78': 'Assam',
  '790': 'Arunachal Pradesh',
  '791': 'Arunachal Pradesh',
  '792': 'Arunachal Pradesh',
  '793': 'Meghalaya',
  '794': 'Meghalaya',
  '795': 'Manipur',
  '796': 'Mizoram',
  '797': 'Nagaland',
  '798': 'Nagaland',
  '799': 'Tripura',
  '80': 'Bihar',
  '83': 'Jharkhand',
  '84': 'Bihar',
  '85': 'Bihar',
});

/** Prefix → the states that share the series. The customer picks one. */
const AMBIGUOUS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '16': ['Chandigarh', 'Punjab', 'Haryana'],
  '19': ['Jammu and Kashmir', 'Ladakh'],
  '24': ['Uttar Pradesh', 'Uttarakhand'],
  '26': ['Uttar Pradesh', 'Uttarakhand'],
  // Vapi and Valsad sit beside Silvassa, Daman and Diu in the same series.
  '396': ['Gujarat', 'Dadra and Nagar Haveli and Daman and Diu'],
  '605': ['Tamil Nadu', 'Puducherry'], // Puducherry town and Villupuram district
  '609': ['Tamil Nadu', 'Puducherry'], // Karaikal
  '81': ['Bihar', 'Jharkhand'],
  '82': ['Bihar', 'Jharkhand'],
});

const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

/** A six-digit pincode, first digit 1–9. India Post allocates no 0 series. */
export function isValidPincode(value: string): boolean {
  return PINCODE_PATTERN.test(value.trim());
}

/** Digits only, so a customer typing "682 035" or "682-035" is not punished. */
export function normalisePincode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

/**
 * The delivery state for a pincode.
 *
 * Longest matching prefix wins, and a definite match beats an ambiguous one of
 * the same length — that is what makes `682555` Lakshadweep rather than the
 * Kerala its `68` series would otherwise imply.
 */
export function resolvePincode(value: string): PincodeResolution {
  const pincode = normalisePincode(value);
  if (!isValidPincode(pincode)) return { kind: 'invalid' };

  for (let length = 6; length >= 2; length -= 1) {
    const prefix = pincode.slice(0, length);
    const definite = DEFINITE[prefix];
    if (definite) return { kind: 'state', state: definite };
    const candidates = AMBIGUOUS[prefix];
    if (candidates) return { kind: 'ambiguous', candidates: [...candidates] };
  }

  return { kind: 'unknown' };
}

/**
 * The state to tax and ship against, given a pincode and whatever the customer
 * selected.
 *
 * The pincode wins whenever it is definite: a customer selecting Kerala for a
 * Bengaluru pincode would otherwise turn an IGST order into a CGST + SGST one.
 * Where the series is shared or unlisted, the selection stands — but it must
 * resolve to a real Indian state, and where the series is shared it must be one
 * of that series' own candidates.
 */
export function resolveDeliveryState(
  pincode: string,
  selectedState: string | null | undefined,
): { state: string } | { error: string } {
  const resolution = resolvePincode(pincode);
  if (resolution.kind === 'invalid') {
    return { error: 'Enter a six-digit pincode.' };
  }
  if (resolution.kind === 'state') {
    return { state: resolution.state };
  }

  const selected = resolveState(selectedState);
  if (!selected) {
    return { error: 'Choose the delivery state.' };
  }
  if (resolution.kind === 'ambiguous' && !resolution.candidates.includes(selected)) {
    return {
      error: `That pincode is in ${formatList(resolution.candidates)}. Check the pincode and the state.`,
    };
  }

  return { state: selected };
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * Every state named in the tables above, for the test that keeps them aligned
 * with `gst.ts`'s canonical names. A typo here would silently become an
 * inter-state supply.
 */
export function allMappedStates(): string[] {
  return [...new Set([...Object.values(DEFINITE), ...Object.values(AMBIGUOUS).flat()])];
}
