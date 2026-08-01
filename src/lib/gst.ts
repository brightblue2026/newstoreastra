/**
 * GST.
 *
 * Two things make this harder than a typical store, and both come from the
 * catalogue rather than the code:
 *
 * 1. The rate is per product, never global. One order can hold an 18% detergent,
 *    a 12% ghee and a nil-rated jaggery. There is no such thing as "the GST
 *    rate" here, and any function that takes one is scoped to a single HSN.
 * 2. Displayed prices are GST-inclusive, per Indian retail convention. Tax is
 *    therefore back-calculated out of the price charged, never added on top.
 *
 * Every rate is in basis points: 18% is `1800`, 5% is `500`, nil is `0`.
 */

import { assertPaise, type Paise } from './money';

/** A tax rate in basis points. 18% is 1800. */
export type Bps = number;

/**
 * BBTC's place of supply. Delivery inside Kerala is an intra-state supply and
 * attracts CGST + SGST; anywhere else is inter-state and attracts IGST.
 *
 * The seller of record — and therefore whether this stays Kerala — is open
 * question 6 in the master brief. It is a constant here so there is exactly one
 * line to change once that is settled.
 */
export const PLACE_OF_SUPPLY_STATE = 'Kerala';
export const PLACE_OF_SUPPLY_STATE_CODE = '32';

export class GstError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GstError';
  }
}

/** GST state codes, as they appear on a GSTIN and an invoice. */
export const STATE_CODES: Readonly<Record<string, string>> = Object.freeze({
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
});

/** Alternative spellings a customer might type or an address might carry. */
const STATE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  kl: 'Kerala',
  kerela: 'Kerala',
  tn: 'Tamil Nadu',
  tamilnadu: 'Tamil Nadu',
  ka: 'Karnataka',
  mh: 'Maharashtra',
  dl: 'Delhi',
  newdelhi: 'Delhi',
  up: 'Uttar Pradesh',
  ap: 'Andhra Pradesh',
  ts: 'Telangana',
  tg: 'Telangana',
  wb: 'West Bengal',
  gj: 'Gujarat',
  pb: 'Punjab',
  hr: 'Haryana',
  rj: 'Rajasthan',
  mp: 'Madhya Pradesh',
  odissa: 'Odisha',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
});

const CANONICAL_BY_KEY = new Map<string, string>();
for (const [code, name] of Object.entries(STATE_CODES)) {
  CANONICAL_BY_KEY.set(code, name);
  CANONICAL_BY_KEY.set(normaliseKey(name), name);
}
for (const [alias, name] of Object.entries(STATE_ALIASES)) {
  CANONICAL_BY_KEY.set(alias, name);
}

function normaliseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves a state name, two-letter abbreviation or GST state code to its
 * canonical name. Returns null when it cannot be identified — the caller
 * decides whether that is a validation error or an inter-state fallback.
 */
export function resolveState(state: string | null | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  if (trimmed === '') return null;
  return CANONICAL_BY_KEY.get(normaliseKey(trimmed)) ?? null;
}

/** The GST state code for a state, or null if unrecognised. */
export function stateCode(state: string | null | undefined): string | null {
  const canonical = resolveState(state);
  if (!canonical) return null;
  const entry = Object.entries(STATE_CODES).find(([, name]) => name === canonical);
  return entry ? entry[0] : null;
}

/**
 * True when delivery is inside the place of supply, so the tax splits into
 * CGST + SGST rather than a single IGST line.
 *
 * An unrecognised state is treated as inter-state. That is the conservative
 * direction: IGST at the full rate collects the same total as CGST + SGST, so
 * the customer is never undercharged and the amount still reconciles.
 */
export function isIntraStateSupply(destinationState: string | null | undefined): boolean {
  return resolveState(destinationState) === PLACE_OF_SUPPLY_STATE;
}

function assertBps(gstRate: unknown): asserts gstRate is Bps {
  if (typeof gstRate !== 'number' || !Number.isInteger(gstRate)) {
    throw new GstError(
      `GST rate must be an integer in basis points (18% is 1800), received ${String(gstRate)}`,
    );
  }
  if (gstRate < 0 || gstRate > 10_000) {
    throw new GstError(`GST rate must be between 0 and 10000 basis points, received ${gstRate}`);
  }
}

/** Formats a basis-point rate for display on an invoice: `1800` becomes "18%". */
export function formatRate(gstRate: Bps): string {
  assertBps(gstRate);
  const percent = gstRate / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

export interface InclusiveSplit {
  /** The amount actually charged, GST included. */
  inclusivePaise: Paise;
  /** The value the tax is calculated on. */
  taxablePaise: Paise;
  /** The tax contained within `inclusivePaise`. */
  taxPaise: Paise;
}

/**
 * Pulls the tax out of a GST-inclusive amount.
 *
 * `taxable = round(inclusive × 10000 / (10000 + rate))`, then the tax is what
 * is left over. Deriving the tax by subtraction rather than by a second
 * multiplication guarantees `taxable + tax === inclusive` exactly, so the
 * invoice always reconciles to the amount charged.
 */
export function splitInclusive(inclusivePaise: Paise, gstRate: Bps): InclusiveSplit {
  assertPaise(inclusivePaise, 'inclusive amount');
  assertBps(gstRate);

  const taxablePaise = Math.round((inclusivePaise * 10_000) / (10_000 + gstRate));
  const taxPaise = inclusivePaise - taxablePaise;

  return { inclusivePaise, taxablePaise, taxPaise };
}

export interface TaxSplit extends InclusiveSplit {
  gstRate: Bps;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
}

/**
 * Splits the tax inside a GST-inclusive amount into the heads that belong on
 * the invoice.
 *
 * Intra-state, the total tax is halved with the odd paise going to SGST, so
 * `cgst + sgst` is always exactly the tax — and exactly what IGST would have
 * been on the same amount. Halving the *rate* instead and calculating twice
 * would let a rounded 9% + 9% drift a paise away from 18%.
 */
export function taxOnInclusive(
  inclusivePaise: Paise,
  gstRate: Bps,
  intraState: boolean,
): TaxSplit {
  const { taxablePaise, taxPaise } = splitInclusive(inclusivePaise, gstRate);

  if (!intraState) {
    return {
      inclusivePaise,
      taxablePaise,
      taxPaise,
      gstRate,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: taxPaise,
    };
  }

  const cgstPaise = Math.floor(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise;

  return {
    inclusivePaise,
    taxablePaise,
    taxPaise,
    gstRate,
    cgstPaise,
    sgstPaise,
    igstPaise: 0,
  };
}

/** One taxable amount, carrying the HSN and rate it was sold under. */
export interface TaxableLine {
  hsnCode: string;
  gstRate: Bps;
  /** GST-inclusive, and already net of any discount. Tax is calculated last. */
  inclusivePaise: Paise;
}

/** One row of the per-HSN summary table printed on the invoice. */
export interface HsnTaxRow {
  hsn: string;
  rate: Bps;
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  taxPaise: Paise;
  inclusivePaise: Paise;
}

export interface TaxByHsnResult {
  /** One row per HSN + rate pair, in descending value order. */
  rows: HsnTaxRow[];
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  taxPaise: Paise;
  inclusivePaise: Paise;
  intraState: boolean;
}

/**
 * Groups taxable lines by HSN and rate and works out the tax for each group.
 *
 * This is the shape `Order.taxByHsn` stores and the shape the invoice's tax
 * summary table prints. A mixed-rate cart is the normal case for this
 * catalogue, not an edge case, so a single blended rate is never produced.
 *
 * Amounts are summed per group *before* the tax is extracted, so the printed
 * row totals reconcile to the amount charged for that group exactly.
 */
export function buildTaxByHsn(
  lines: TaxableLine[],
  destinationState: string | null | undefined,
): TaxByHsnResult {
  const intraState = isIntraStateSupply(destinationState);

  const groups = new Map<string, { hsn: string; rate: Bps; inclusivePaise: Paise }>();

  for (const line of lines) {
    assertPaise(line.inclusivePaise, `line amount for HSN ${line.hsnCode}`);
    assertBps(line.gstRate);

    const hsn = line.hsnCode.trim();
    if (hsn === '') {
      throw new GstError(
        'Every taxable line needs an HSN code. A product cannot be published without one.',
      );
    }

    const key = `${hsn}::${line.gstRate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.inclusivePaise += line.inclusivePaise;
    } else {
      groups.set(key, { hsn, rate: line.gstRate, inclusivePaise: line.inclusivePaise });
    }
  }

  const rows: HsnTaxRow[] = [...groups.values()]
    .map((group) => {
      const split = taxOnInclusive(group.inclusivePaise, group.rate, intraState);
      return {
        hsn: group.hsn,
        rate: group.rate,
        taxablePaise: split.taxablePaise,
        cgstPaise: split.cgstPaise,
        sgstPaise: split.sgstPaise,
        igstPaise: split.igstPaise,
        taxPaise: split.taxPaise,
        inclusivePaise: split.inclusivePaise,
      };
    })
    .sort((a, b) => b.inclusivePaise - a.inclusivePaise || a.hsn.localeCompare(b.hsn));

  const sum = (pick: (row: HsnTaxRow) => number) => rows.reduce((acc, row) => acc + pick(row), 0);

  return {
    rows,
    taxablePaise: sum((r) => r.taxablePaise),
    cgstPaise: sum((r) => r.cgstPaise),
    sgstPaise: sum((r) => r.sgstPaise),
    igstPaise: sum((r) => r.igstPaise),
    taxPaise: sum((r) => r.taxPaise),
    inclusivePaise: sum((r) => r.inclusivePaise),
    intraState,
  };
}
