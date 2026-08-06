/**
 * Cash-on-delivery eligibility — brief §10: "Controls in admin settings:
 * pincode allowlist, flat fee (not discountable), minimum and maximum order
 * value, global toggle." And: "Launch on a Kerala-and-adjacent allowlist,
 * measure RTO for two months, then expand."
 *
 * There is nowhere these settings live yet — no `Settings` model, and no
 * admin screen writes to `ContentBlock` for this. `CodSettings` is the shape
 * that screen and this function will share once it exists; until then a
 * caller supplies it directly (e.g. from `.env` while there is no UI for it).
 *
 * `feePaise` is intentionally never touched here — `lib/pricing.ts` already
 * adds it after every discount step, which is what "not discountable" means.
 */

import { formatINR, type Paise } from './money';

export interface CodSettings {
  enabled: boolean;
  feePaise: Paise;
  minOrderPaise: Paise;
  maxOrderPaise: Paise;
  /**
   * Each entry is a pincode or a pincode prefix — `"67"` allows every
   * pincode starting with 67. An empty list means every pincode is allowed
   * (no allowlist configured yet).
   */
  pincodeAllowlist: string[];
}

export interface CodEligibilityInput {
  subtotalPaise: Paise;
  pincode: string;
}

export interface CodEligibilityResult {
  eligible: boolean;
  reason?: string;
  feePaise: Paise;
}

export function checkCodEligibility(
  settings: CodSettings,
  input: CodEligibilityInput,
): CodEligibilityResult {
  if (!settings.enabled) {
    return { eligible: false, reason: 'Cash on delivery is not available right now.', feePaise: 0 };
  }

  const pincode = input.pincode.trim();
  const allowlisted =
    settings.pincodeAllowlist.length === 0 ||
    settings.pincodeAllowlist.some((prefix) => pincode.startsWith(prefix));
  if (!allowlisted) {
    return {
      eligible: false,
      reason: 'Cash on delivery is not available at this pincode yet.',
      feePaise: 0,
    };
  }

  if (input.subtotalPaise < settings.minOrderPaise) {
    return {
      eligible: false,
      reason: `Cash on delivery needs a minimum order of ${formatINR(settings.minOrderPaise)}.`,
      feePaise: 0,
    };
  }

  if (input.subtotalPaise > settings.maxOrderPaise) {
    return {
      eligible: false,
      reason: `Cash on delivery is not available above ${formatINR(settings.maxOrderPaise)} — pay online instead.`,
      feePaise: 0,
    };
  }

  return { eligible: true, feePaise: settings.feePaise };
}
