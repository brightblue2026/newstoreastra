import { MoneyError, parseRupeesToPaise, type Paise } from '@/lib/money';
import { variantFieldsSchema } from './variant-fields';

/**
 * Bulk variant entry on product creation.
 *
 * The single-variant form (`[productId]/variants/variant-form.tsx`) stays the way to add
 * one variant to a product that already exists. This module is for the other case: a
 * product that ships with several sizes/formats/fragrances from day one — MX-3's 24
 * fragrances × 3 sizes being the motivating example — entered as rows on the same screen
 * that creates the product, in one submit.
 *
 * Pure and framework-free so the parsing/validation can be unit tested without a database
 * or a rendered form, matching `src/lib/cart-line.ts` / `src/lib/combo-choice.ts`.
 */

/** The client-side shape of one row — rupee strings, not yet paise. */
export interface VariantRowValue {
  sku: string;
  variantName: string;
  variantHex: string;
  size: string;
  format: string;
  mrpRupees: string;
  priceRupees: string;
  wholesaleRupees: string;
  weightGrams: string;
  barcode: string;
}

export const EMPTY_VARIANT_ROW: VariantRowValue = {
  sku: '',
  variantName: '',
  variantHex: '',
  size: '',
  format: '',
  mrpRupees: '',
  priceRupees: '',
  wholesaleRupees: '',
  weightGrams: '',
  barcode: '',
};

/** A row after validation — paise, not rupee strings; blank money is `null`, never `0`. */
export interface ParsedVariantRow {
  sku: string;
  variantName: string | null;
  variantHex: string | null;
  size: string;
  format: string | null;
  mrpPaise: Paise | null;
  pricePaise: Paise | null;
  wholesalePaise: Paise | null;
  weightGrams: number | null;
  barcode: string | null;
}

// Same field rules as the single-variant form (`variant-fields.ts`) — this is
// the same data, entered in bulk.
const rowSchema = variantFieldsSchema;

/** Sane ceiling — MX-3's entire catalogue (24 fragrances x 3 sizes) is 72. */
const MAX_ROWS = 200;

function parseOptionalPaise(raw: string, label: string, rowNumber: number): Paise | null {
  if (!raw) return null;
  try {
    return parseRupeesToPaise(raw);
  } catch (error) {
    const message = error instanceof MoneyError ? error.message : 'Enter a valid amount.';
    throw new RowError(`Row ${rowNumber}: ${label} — ${message}`);
  }
}

class RowError extends Error {}

/**
 * True when a row is untouched — filtered out client-side before submit, and again here
 * since the server never trusts the client's filtering.
 */
function isBlankRow(row: Partial<VariantRowValue>): boolean {
  return Object.values(row).every((value) => !value);
}

/**
 * Parses and validates the `variantsJson` hidden field. An empty or missing payload is not
 * an error — the bulk rows are optional, a product can still be created with zero variants
 * and have them added one at a time afterwards, same as today.
 */
export function parseVariantRowsJson(
  raw: string | null | undefined,
): { rows: ParsedVariantRow[] } | { error: string } {
  if (!raw || raw.trim() === '') return { rows: [] };

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return { error: 'Variant rows could not be read. Try again.' };
  }

  if (!Array.isArray(candidate)) {
    return { error: 'Variant rows could not be read. Try again.' };
  }

  const nonBlank = candidate.filter(
    (row): row is Partial<VariantRowValue> => typeof row === 'object' && row !== null && !isBlankRow(row),
  );

  if (nonBlank.length === 0) return { rows: [] };
  if (nonBlank.length > MAX_ROWS) {
    return { error: `Too many variant rows — ${MAX_ROWS} is the most this form accepts at once.` };
  }

  const skusSeen = new Set<string>();
  const parsed: ParsedVariantRow[] = [];

  for (let i = 0; i < nonBlank.length; i += 1) {
    const rowNumber = i + 1;
    const result = rowSchema.safeParse(nonBlank[i]);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Check this row.';
      return { error: `Row ${rowNumber}: ${message}` };
    }
    const data = result.data;

    const sku = data.sku.trim();
    const skuKey = sku.toLowerCase();
    if (skusSeen.has(skuKey)) {
      return { error: `Row ${rowNumber}: SKU "${sku}" is repeated earlier in this batch.` };
    }
    skusSeen.add(skuKey);

    try {
      parsed.push({
        sku,
        variantName: data.variantName || null,
        variantHex: data.variantHex || null,
        size: data.size.trim(),
        format: data.format || null,
        mrpPaise: parseOptionalPaise(data.mrpRupees ?? '', 'MRP', rowNumber),
        pricePaise: parseOptionalPaise(data.priceRupees ?? '', 'Price', rowNumber),
        wholesalePaise: parseOptionalPaise(data.wholesaleRupees ?? '', 'Wholesale', rowNumber),
        weightGrams: parseWeightGrams(data.weightGrams ?? '', rowNumber),
        barcode: data.barcode || null,
      });
    } catch (error) {
      if (error instanceof RowError) return { error: error.message };
      throw error;
    }
  }

  return { rows: parsed };
}

function parseWeightGrams(raw: string, rowNumber: number): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new RowError(`Row ${rowNumber}: Weight must be a whole number of grams.`);
  }
  return value;
}
