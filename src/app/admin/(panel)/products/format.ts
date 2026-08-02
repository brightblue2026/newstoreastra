/**
 * Plain data transforms shared between the product server actions and the
 * edit page. Kept out of `actions.ts` because a `'use server'` file may only
 * export async functions.
 */

export interface Claim {
  icon: string;
  label: string;
}

/** One claim per line: "icon | label". Blank lines are skipped. */
export function parseClaims(raw: string): Claim[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [icon, ...rest] = line.split('|').map((part) => part.trim());
      return { icon: icon || '', label: rest.join('|') || icon || '' };
    });
}

/** Reverses `parseClaims`, for pre-filling the edit form. */
export function formatClaims(claims: unknown): string {
  if (!Array.isArray(claims)) return '';
  return claims
    .map((claim) => {
      if (claim && typeof claim === 'object' && 'icon' in claim && 'label' in claim) {
        const { icon, label } = claim as Claim;
        return `${icon} | ${label}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** One usage step per line. Blank lines are skipped. */
export function parseSteps(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Reverses `parseSteps`, for pre-filling the edit form. */
export function formatSteps(steps: unknown): string {
  if (!Array.isArray(steps)) return '';
  return steps.filter((step): step is string => typeof step === 'string').join('\n');
}

export interface FoodLabel {
  netQty: string;
  batch: string;
  mfgDate: string;
  bestBefore: string;
  vegMark: string;
  nutrition: string;
  allergens: string;
}

const EMPTY_FOOD_LABEL: FoodLabel = {
  netQty: '',
  batch: '',
  mfgDate: '',
  bestBefore: '',
  vegMark: '',
  nutrition: '',
  allergens: '',
};

/** Reads a stored `foodLabel` JSON value back into individual form fields. */
export function readFoodLabel(foodLabel: unknown): FoodLabel {
  if (!foodLabel || typeof foodLabel !== 'object') return EMPTY_FOOD_LABEL;
  const source = foodLabel as Record<string, unknown>;
  return {
    netQty: typeof source.netQty === 'string' ? source.netQty : '',
    batch: typeof source.batch === 'string' ? source.batch : '',
    mfgDate: typeof source.mfgDate === 'string' ? source.mfgDate : '',
    bestBefore: typeof source.bestBefore === 'string' ? source.bestBefore : '',
    vegMark: typeof source.vegMark === 'string' ? source.vegMark : '',
    nutrition: typeof source.nutrition === 'string' ? source.nutrition : '',
    allergens: typeof source.allergens === 'string' ? source.allergens : '',
  };
}

/** Every field present and non-empty. */
export function foodLabelIncomplete(label: FoodLabel | null): boolean {
  if (!label) return false;
  return Object.values(label).some((value) => !value);
}
