/**
 * Pure helpers for the guided "Add a product" screen.
 *
 * The guided screen exists because the full product form (`../product-form.tsx`)
 * asks a non-technical user for a URL slug, a stock code, an unexplained GST
 * percentage and two encoded text formats. None of that is wrong for a
 * catalogue manager who knows the system; all of it stops a shop owner from
 * entering their own product. CLAUDE.md's working agreement: "when ambiguous,
 * pick what keeps the admin simpler — the users are not technical."
 *
 * Everything here is framework-free so it can be unit tested without a database
 * or a rendered form, matching `../variant-rows.ts` and `src/lib/cart-line.ts`.
 *
 * The guided screen submits to the *same* `createProductAction` as the full
 * form, using the same field names. It is a friendlier set of questions over an
 * unchanged server contract — no second validation path, no second audit path.
 */

/** Turns "MX Three Dish Wash 500ml" into "mx-three-dish-wash-500ml". */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining marks so "Ilfa Vallëy" slugs as "ilfa-valley", not "ilfa-vally".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A stock code the user never has to invent. Brand and size are included
 * because `sku` is globally unique — two brands with a "500 ml" of the same
 * product name would otherwise collide on save.
 *
 * Returns '' when there is nothing to build from, so the caller can leave the
 * field empty rather than showing a meaningless stub.
 */
export function suggestSku(brandName: string, productName: string, size: string): string {
  const parts = [brandName, productName, size]
    .map((part) => slugify(part).replace(/-/g, ''))
    .filter(Boolean);
  if (parts.length === 0) return '';
  return parts
    .map((part) => part.slice(0, 12))
    .join('-')
    .toUpperCase();
}

/**
 * `parseClaims` in `../format.ts` reads "icon | label", but `ProductDetail.tsx`
 * renders only the label — the icon half is stored and never shown. Rather than
 * ask a non-technical user for a value nothing displays, the guided form
 * collects the text alone and emits a leading pipe, which parses to
 * `{ icon: '', label: text }`.
 */
export function claimsToFieldValue(claims: string[]): string {
  return claims
    .map((claim) => claim.trim())
    .filter(Boolean)
    .map((claim) => `| ${claim}`)
    .join('\n');
}

/** Usage steps are one per line, blanks dropped — see `parseSteps`. */
export function stepsToFieldValue(steps: string[]): string {
  return steps.map((step) => step.trim()).filter(Boolean).join('\n');
}

/**
 * The GST rates this catalogue actually spans, with a real example of each so
 * the user picks by recognising their product rather than by knowing tax law.
 * CLAUDE.md: the rate is per product, never global — this is a shortcut to
 * choosing one, not a default applied to everything.
 */
export const GST_CHOICES: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Nil rated — jaggery, unbranded staples' },
  { value: '5', label: '5% — spices, tea' },
  { value: '12', label: '12% — ghee, processed food' },
  { value: '18', label: '18% — detergents, cleaning, personal care, perfume' },
  { value: '28', label: '28% — rare; check before choosing' },
];

export interface ChecklistItem {
  label: string;
  done: boolean;
  /** What the user should do about it, when it is not done. */
  hint: string;
}

export interface ChecklistInput {
  hasName: boolean;
  hasBrand: boolean;
  hasCategory: boolean;
  hasSummary: boolean;
  hasDescription: boolean;
  hasHsn: boolean;
  variantCount: number;
  isFoodProduct: boolean;
  foodLabelComplete: boolean;
}

/**
 * Mirrors the publish guard in `setProductActiveAction` so the user learns what
 * "Draft" will require *while typing*, instead of creating a product and then
 * being refused at the Publish button with no idea why.
 *
 * Deliberately not authoritative: the server re-checks all of this. If the two
 * ever disagree the server wins, and this list is the thing to correct.
 */
export function publishChecklist(input: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      label: 'Name, brand and category',
      done: input.hasName && input.hasBrand && input.hasCategory,
      hint: 'Fill in step 1.',
    },
    {
      label: 'Summary and description',
      done: input.hasSummary && input.hasDescription,
      hint: 'Fill in step 2.',
    },
    {
      label: 'HSN code',
      done: input.hasHsn,
      hint: 'Ask your accountant for the HSN code. It can be added later.',
    },
    {
      label: 'At least one size',
      done: input.variantCount > 0,
      hint: 'Add a size in step 4.',
    },
    {
      label: 'At least one photo',
      done: false,
      hint: 'Photos are added on the product page straight after saving.',
    },
  ];

  if (input.isFoodProduct) {
    items.push({
      label: 'Complete FSSAI food label',
      done: input.foodLabelComplete,
      hint: 'Every food field in step 5 is required by law before this can go live.',
    });
  }

  return items;
}

/**
 * One size/fragrance row as the guided screen collects it — a deliberate subset
 * of `../variant-rows.ts`'s `VariantRowValue`. Format, barcode, wholesale price
 * and the variant accent colour are not asked for here; they are catalogue-
 * manager fields, editable afterwards on the full variant form. The row is
 * widened back to the full shape at submit time, so the server contract is
 * unchanged.
 */
export interface GuidedVariantRow {
  variantName: string;
  size: string;
  mrpRupees: string;
  priceRupees: string;
  weightGrams: string;
  /** Left blank unless the user opens "Use my own stock code" on that row. */
  skuOverride: string;
}

export const EMPTY_GUIDED_ROW: GuidedVariantRow = {
  variantName: '',
  size: '',
  mrpRupees: '',
  priceRupees: '',
  weightGrams: '',
  skuOverride: '',
};

/**
 * A per-row stock code. The fragrance name joins the size in `suggestSku`'s
 * discriminator slot because MX-3 ships the same size in 24 fragrances — size
 * alone would hand every one of them the same `sku`, which is globally unique.
 */
export function suggestRowSku(
  brandName: string,
  productName: string,
  variantName: string,
  size: string,
): string {
  const discriminator = [variantName, size]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  return suggestSku(brandName, productName, discriminator);
}

/**
 * The stock code actually submitted for each row, in row order.
 *
 * Generated codes are made unique within the batch by suffixing `-2`, `-3` …,
 * because `parseVariantRowsJson` rejects the whole submit on a repeat and a
 * non-technical user cannot be expected to debug a code they never typed.
 *
 * A code the user typed themselves is returned untouched, even when it repeats.
 * Silently renaming someone's own stock code would be worse than the server's
 * explicit "SKU is repeated earlier in this batch" — that one they can act on.
 * Every typed code is reserved before any code is generated, so an automatic
 * code never steals one.
 */
export function resolveRowSkus(
  rows: GuidedVariantRow[],
  brandName: string,
  productName: string,
): string[] {
  const taken = new Set<string>();
  for (const row of rows) {
    const override = row.skuOverride.trim();
    if (override) taken.add(override.toLowerCase());
  }

  return rows.map((row) => {
    const override = row.skuOverride.trim();
    if (override) return override;

    const base = suggestRowSku(brandName, productName, row.variantName, row.size);
    if (!base) return '';

    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

/**
 * What a brand's segment implies about the two regulatory checkboxes, so the
 * user is not asked a question the brand already answers.
 *
 * `FRAGRANCE` deliberately returns neither. Whether MAKAFA's perfume needs a
 * cosmetics licence is one of the catalogue's open questions (CLAUDE.md: the
 * brand's licences are still unseeded); pre-ticking a licence requirement is a
 * guess, and the working agreement says not to guess. The user is prompted
 * instead — see `segmentNote`.
 */
export function segmentDefaults(segment: string | null): {
  isFoodProduct: boolean;
  isCosmetic: boolean;
} {
  return {
    isFoodProduct: segment === 'FOOD' || segment === 'BEVERAGE',
    isCosmetic: segment === 'PERSONAL_CARE',
  };
}

/** A one-line warning shown under the brand picker, or '' when there is nothing to say. */
export function segmentNote(segment: string | null): string {
  if (segment === 'FOOD' || segment === 'BEVERAGE') {
    return 'This is a food brand, so the FSSAI label step is required by law before it can go live.';
  }
  if (segment === 'PERSONAL_CARE') {
    return 'This is a personal care brand — it needs a cosmetics licence on the brand record.';
  }
  if (segment === 'FRAGRANCE') {
    return 'Perfume may need a cosmetics licence. Confirm before publishing, and tick the box below if it does.';
  }
  return '';
}
