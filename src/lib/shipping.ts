/**
 * Shipping rates — brief §10: "Fallback: on timeout or failure at checkout, use
 * the admin's flat-rate weight slab table. Never block an order because a third
 * party is down."
 *
 * This module *is* that fallback table, and at Phase 5 it is the only rate
 * source there is: Shiprocket rate-shopping is Phase 6. `rateShipping` is pure
 * — it prices a weight, it does not call anyone — so the Phase 6 work is to try
 * Shiprocket first and fall back to this, not to replace it.
 *
 * Deliberately absent: a free-shipping threshold. `FREE_SHIPPING` is one of the
 * five `DiscountType`s, and `cart-pricing.ts` already derives the drawer's
 * free-shipping progress from whichever real discount configures it. A second
 * threshold living in settings would be a second source of truth for the same
 * number, and the two would disagree the first time someone changed one.
 */

import type { Paise } from './money';

export interface ShippingSlab {
  /** Inclusive upper bound of the slab, in grams. */
  uptoGrams: number;
  pricePaise: Paise;
}

export interface ShippingSettings {
  /**
   * Sorted or not — `rateShipping` sorts. An empty table means delivery is not
   * configured yet, and nothing is charged for it. The admin screen says so in
   * as many words, because free delivery on every order is a real cost and it
   * should not be a silent default.
   */
  slabs: ShippingSlab[];
  /** Charged when an order is heavier than every slab. */
  overflowPricePaise: Paise;
  /**
   * Assumed weight for one unit of a variant with no `weightGrams`. Most of the
   * catalogue has none yet. Zero means "assume nothing", which lands the order
   * in the lightest slab rather than inventing a weight.
   */
  defaultUnitGrams: number;
  /**
   * Pincode prefixes this store delivers to. `"67"` covers every 67xxxx
   * pincode. Empty means everywhere — no serviceability limit configured.
   *
   * Phase 6 replaces this with a live Shiprocket serviceability check; it stays
   * as the answer when Shiprocket is unreachable.
   */
  serviceablePincodePrefixes: string[];
}

export interface ShippingQuote {
  pricePaise: Paise;
  totalGrams: number;
  /** Which slab priced it, for the admin order detail. Null when nothing is configured. */
  slabUptoGrams: number | null;
  /** True when the order is heavier than every configured slab. */
  overflow: boolean;
}

/** True when the pincode falls inside the configured serviceable prefixes. */
export function isServiceablePincode(settings: ShippingSettings, pincode: string): boolean {
  const trimmed = pincode.trim();
  if (settings.serviceablePincodePrefixes.length === 0) return true;
  return settings.serviceablePincodePrefixes.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * The billable weight of a set of lines. A variant with no `weightGrams` counts
 * as `defaultUnitGrams` per unit rather than being skipped, so an unweighed
 * catalogue does not silently ship in the lightest slab once a default is set.
 */
export function totalWeightGrams(
  lines: Array<{ quantity: number; weightGrams: number | null }>,
  settings: Pick<ShippingSettings, 'defaultUnitGrams'>,
): number {
  return lines.reduce(
    (sum, line) => sum + (line.weightGrams ?? settings.defaultUnitGrams) * line.quantity,
    0,
  );
}

/**
 * Price a weight against the slab table. The narrowest slab that can hold the
 * weight wins; heavier than all of them is `overflowPricePaise`.
 */
export function rateShipping(settings: ShippingSettings, totalGrams: number): ShippingQuote {
  if (settings.slabs.length === 0) {
    return { pricePaise: 0, totalGrams, slabUptoGrams: null, overflow: false };
  }

  const sorted = [...settings.slabs].sort((a, b) => a.uptoGrams - b.uptoGrams);
  const slab = sorted.find((candidate) => totalGrams <= candidate.uptoGrams);

  if (!slab) {
    return {
      pricePaise: settings.overflowPricePaise,
      totalGrams,
      slabUptoGrams: null,
      overflow: true,
    };
  }

  return {
    pricePaise: slab.pricePaise,
    totalGrams,
    slabUptoGrams: slab.uptoGrams,
    overflow: false,
  };
}
