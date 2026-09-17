import { z } from 'zod';

/*
  Retailers — the offline stockists behind /stockists.

  Pure: the admin form, the CSV import and the storefront locator all go
  through this module, and the tests import it directly. Most of this
  catalogue has no published online price, so "which shop near me has it" is
  a primary path for customers, and the list has to be maintainable by
  whoever at BBTC keeps the distributor spreadsheet — hence CSV import rather
  than a hundred trips through a form.
*/

export const KERALA_DISTRICTS = [
  'Thiruvananthapuram',
  'Kollam',
  'Pathanamthitta',
  'Alappuzha',
  'Kottayam',
  'Idukki',
  'Ernakulam',
  'Thrissur',
  'Palakkad',
  'Malappuram',
  'Kozhikode',
  'Wayanad',
  'Kannur',
  'Kasaragod',
] as const;

/** Older English names still in common use on distributor sheets. */
const DISTRICT_ALIASES: Record<string, string> = {
  trivandrum: 'Thiruvananthapuram',
  quilon: 'Kollam',
  alleppey: 'Alappuzha',
  trichur: 'Thrissur',
  palghat: 'Palakkad',
  calicut: 'Kozhikode',
  cannanore: 'Kannur',
  kasargod: 'Kasaragod',
  kasargode: 'Kasaragod',
};

/**
 * One spelling per district, so the storefront groups "ernakulam",
 * "Ernakulam district" and "ERNAKULAM" together instead of as three places.
 * A district outside Kerala is kept as typed, title-cased.
 */
export function normaliseDistrict(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const lookup = cleaned.toLowerCase().replace(/\s+district$/, '');

  const known =
    KERALA_DISTRICTS.find((district) => district.toLowerCase() === lookup) ??
    DISTRICT_ALIASES[lookup];
  if (known) return known;

  return cleaned
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

export const PINCODE_PATTERN = /^[1-9]\d{5}$/;

export const retailerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Shop name is required.')
    .max(160, 'Shop name must be 160 characters or fewer.'),
  address: z
    .string()
    .trim()
    .min(1, 'Address is required.')
    .max(400, 'Address must be 400 characters or fewer.'),
  city: z
    .string()
    .trim()
    .min(1, 'City or town is required.')
    .max(80, 'City or town must be 80 characters or fewer.'),
  district: z
    .string()
    .trim()
    .min(1, 'District is required.')
    .max(80, 'District must be 80 characters or fewer.')
    .transform(normaliseDistrict),
  pincode: z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(z.string().regex(PINCODE_PATTERN, 'Pincode must be 6 digits.')),
  phone: z
    .string()
    .trim()
    .max(20, 'Phone must be 20 characters or fewer.')
    .regex(/^[\d+\-\s()]*$/, 'Phone may only contain digits, spaces, +, - and brackets.')
    .transform((value) => value || null),
});

export type RetailerInput = z.output<typeof retailerSchema>;
export type RetailerField = keyof RetailerInput;

/**
 * What makes two rows the same shop: its name and its pincode. There is no
 * natural unique id on a distributor sheet, and re-importing the same sheet
 * must update shops rather than list every one of them twice.
 */
export function retailerKey(name: string, pincode: string): string {
  return `${name.trim().replace(/\s+/g, ' ').toLowerCase()}|${pincode.replace(/\s+/g, '')}`;
}

// ---------- CSV ----------

class CsvError extends Error {}

/**
 * RFC 4180 CSV: commas, double-quoted fields, doubled quotes inside them, and
 * CRLF or LF line endings — which covers what Excel, Google Sheets and
 * LibreOffice write. A UTF-8 byte-order mark (Excel adds one) is dropped.
 * Rows with nothing but empty cells are dropped too; spreadsheets trail them.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellWasQuoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell === '' && !cellWasQuoted) {
      inQuotes = true;
      cellWasQuoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
      cellWasQuoted = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      cellWasQuoted = false;
    } else {
      cell += ch;
    }
  }

  if (inQuotes) {
    throw new CsvError(
      'A quoted value in the file is never closed. Re-save the sheet as CSV and try again.',
    );
  }
  if (cell !== '' || cellWasQuoted || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

const HEADER_ALIASES: Record<string, RetailerField> = {
  name: 'name',
  shop: 'name',
  'shop name': 'name',
  'store name': 'name',
  retailer: 'name',
  'retailer name': 'name',
  address: 'address',
  city: 'city',
  town: 'city',
  'city or town': 'city',
  'city/town': 'city',
  district: 'district',
  pincode: 'pincode',
  'pin code': 'pincode',
  pin: 'pincode',
  'postal code': 'pincode',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  telephone: 'phone',
};

export const RETAILER_CSV_HEADER = 'name,address,city,district,pincode,phone';

const REQUIRED_COLUMNS: RetailerField[] = ['name', 'address', 'city', 'district', 'pincode'];

export const MAX_IMPORT_ROWS = 2000;
/** Under Next's 1 MB server-action body limit, with room for the form around it. */
export const MAX_IMPORT_BYTES = 512_000;
const MAX_REPORTED_ERRORS = 25;

export type RetailerCsvResult =
  | { ok: true; rows: RetailerInput[]; duplicatesMerged: number }
  | { ok: false; errors: string[] };

/**
 * Reads a retailer sheet, all or nothing: one bad row and nothing imports,
 * with every problem listed by spreadsheet row number. A partial import would
 * leave the editor fixing a sheet whose first half is already live, and the
 * second upload would then have to be reasoned about row by row.
 */
export function parseRetailerCsv(text: string): RetailerCsvResult {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvError) return { ok: false, errors: [error.message] };
    throw error;
  }

  if (table.length === 0) return { ok: false, errors: ['The file is empty.'] };

  const [header, ...body] = table;
  const columns = new Map<RetailerField, number>();
  for (let index = 0; index < header.length; index += 1) {
    const label = header[index].trim().toLowerCase().replace(/[_\s]+/g, ' ');
    const column = HEADER_ALIASES[label];
    if (!column) continue;
    if (columns.has(column)) {
      return { ok: false, errors: [`The file has more than one "${column}" column.`] };
    }
    columns.set(column, index);
  }

  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        `The first row must name the columns. Missing: ${missing.join(', ')}. Expected: ${RETAILER_CSV_HEADER}.`,
      ],
    };
  }

  if (body.length === 0) {
    return { ok: false, errors: ['The file names its columns but has no shops under them.'] };
  }
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      errors: [
        `The file has ${body.length} shops; ${MAX_IMPORT_ROWS} is the most one upload takes. Split it into smaller files.`,
      ],
    };
  }

  const errors: string[] = [];
  const byKey = new Map<string, RetailerInput>();
  let duplicatesMerged = 0;

  body.forEach((cells, index) => {
    // +2: spreadsheet rows count from 1, and row 1 is the header.
    const rowNumber = index + 2;
    const cell = (column: RetailerField) => {
      const at = columns.get(column);
      return at === undefined ? '' : (cells[at] ?? '');
    };

    const parsed = retailerSchema.safeParse({
      name: cell('name'),
      address: cell('address'),
      city: cell('city'),
      district: cell('district'),
      pincode: cell('pincode'),
      phone: cell('phone'),
    });

    if (!parsed.success) {
      const messages = [...new Set(parsed.error.issues.map((issue) => issue.message))];
      errors.push(`Row ${rowNumber}: ${messages.join(' ')}`);
      return;
    }

    const key = retailerKey(parsed.data.name, parsed.data.pincode);
    if (byKey.has(key)) duplicatesMerged += 1;
    // The later row wins: sheets are usually appended to, so the lower row is
    // the more recent correction.
    byKey.set(key, parsed.data);
  });

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_REPORTED_ERRORS);
    if (errors.length > shown.length) {
      shown.push(`…and ${errors.length - shown.length} more rows with problems.`);
    }
    return { ok: false, errors: shown };
  }

  return { ok: true, rows: [...byKey.values()], duplicatesMerged };
}

// ---------- Import plan ----------

export interface ExistingRetailer extends RetailerInput {
  id: string;
  isActive: boolean;
}

export interface RetailerImportPlan {
  create: RetailerInput[];
  update: { id: string; before: ExistingRetailer; data: RetailerInput }[];
  unchanged: number;
}

function sameDetails(a: RetailerInput, b: RetailerInput): boolean {
  return (
    a.name === b.name &&
    a.address === b.address &&
    a.city === b.city &&
    a.district === b.district &&
    a.pincode === b.pincode &&
    a.phone === b.phone
  );
}

/**
 * Decides what an import does to the table. A shop on the sheet that already
 * exists is updated — and reactivated, because listing it is the statement
 * that it stocks Bright Blue. A shop missing from the sheet is left alone:
 * one district's file must not wipe out every other district.
 */
export function planRetailerImport(
  existing: readonly ExistingRetailer[],
  incoming: readonly RetailerInput[],
): RetailerImportPlan {
  const current = new Map<string, ExistingRetailer>();
  for (const retailer of existing) {
    const key = retailerKey(retailer.name, retailer.pincode);
    // Two identical shops entered by hand: match the first, touch neither twice.
    if (!current.has(key)) current.set(key, retailer);
  }

  const plan: RetailerImportPlan = { create: [], update: [], unchanged: 0 };
  for (const row of incoming) {
    const match = current.get(retailerKey(row.name, row.pincode));
    if (!match) {
      plan.create.push(row);
    } else if (match.isActive && sameDetails(match, row)) {
      plan.unchanged += 1;
    } else {
      plan.update.push({ id: match.id, before: match, data: row });
    }
  }
  return plan;
}

// ---------- Storefront search ----------

/** The first three digits: the sorting district of an Indian pincode. */
export function pincodeArea(pincode: string): string {
  return pincode.slice(0, 3);
}

/**
 * Shops at exactly this pincode first, then the rest of its postal area.
 * Neither list is empty-padded with far-away shops: a customer in 682035
 * shown a shop in Kasaragod has been told nothing useful.
 */
export function splitByPincode<T extends { pincode: string }>(
  retailers: readonly T[],
  pincode: string,
): { exact: T[]; nearby: T[] } {
  const area = pincodeArea(pincode);
  const exact: T[] = [];
  const nearby: T[] = [];
  for (const retailer of retailers) {
    if (retailer.pincode === pincode) exact.push(retailer);
    else if (pincodeArea(retailer.pincode) === area) nearby.push(retailer);
  }
  return { exact, nearby };
}

/** Groups in first-seen order, so the caller's sort decides the ordering. */
export function groupByDistrict<T extends { district: string }>(
  retailers: readonly T[],
): { district: string; stockists: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const retailer of retailers) {
    const list = groups.get(retailer.district) ?? [];
    list.push(retailer);
    groups.set(retailer.district, list);
  }
  return [...groups.entries()].map(([district, stockists]) => ({ district, stockists }));
}
