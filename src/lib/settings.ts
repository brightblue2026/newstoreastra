import 'server-only';
import { z } from 'zod';
import { db } from '@/lib/db';
import { MAX_PAISE } from '@/lib/money';
import type { CodSettings } from '@/lib/cod';
import type { ShippingSettings } from '@/lib/shipping';

/*
  Operational settings — the `Setting` table, given a shape.

  Same arrangement as `content.ts`: one Zod schema per key, a code-level
  default for every key, and a row that fails validation is discarded in
  favour of the default rather than crashing checkout. The difference is what
  is at stake. Content getting this wrong costs a hero image; settings getting
  it wrong costs a customer the wrong delivery charge, so the defaults here are
  chosen to be *safe rather than plausible*.

  Brief §14 Q17 — the free-shipping threshold, weight slabs, COD fee and COD
  pincodes — is unanswered. So no number in this file is a guess at BBTC's
  policy:

    - COD ships **disabled**. It is not available until an administrator turns
      it on, because a COD fee nobody set and a pincode allowlist nobody drew
      are both worse than the option being absent.
    - The slab table ships **empty**, which charges nothing for delivery. That
      is a real cost, so the admin screen says it in as many words rather than
      letting free delivery be a silent default. The alternative — refusing
      every order until someone configures a slab — makes the store unusable
      to fix a number that takes one screen to enter.

  Once Q17 is answered, the answer is typed into /admin/settings. Nothing here
  needs a deploy.
*/

export const SETTING_KEYS = {
  cod: 'checkout_cod',
  shipping: 'shipping_rates',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const paise = z.number().int().min(0).max(MAX_PAISE);

/** A pincode or a pincode prefix — `"67"` covers every 67xxxx pincode. */
const pincodePrefix = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{0,5}$/, 'Use a pincode or the first digits of one, like 67 or 682035.');

export const codSettingsSchema = z.object({
  enabled: z.boolean(),
  feePaise: paise,
  minOrderPaise: paise,
  maxOrderPaise: paise,
  pincodeAllowlist: z.array(pincodePrefix).max(500),
});

export const shippingSettingsSchema = z.object({
  slabs: z
    .array(z.object({ uptoGrams: z.number().int().min(1).max(100_000), pricePaise: paise }))
    .max(20),
  overflowPricePaise: paise,
  defaultUnitGrams: z.number().int().min(0).max(100_000),
  serviceablePincodePrefixes: z.array(pincodePrefix).max(500),
});

export const DEFAULT_COD_SETTINGS: CodSettings = {
  enabled: false,
  feePaise: 0,
  minOrderPaise: 0,
  maxOrderPaise: MAX_PAISE,
  pincodeAllowlist: [],
};

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  slabs: [],
  overflowPricePaise: 0,
  defaultUnitGrams: 0,
  serviceablePincodePrefixes: [],
};

export interface CheckoutSettings {
  cod: CodSettings;
  shipping: ShippingSettings;
  /** True when no administrator has saved a delivery slab table yet. */
  shippingUnconfigured: boolean;
}

function parseOr<T>(schema: z.ZodType<T>, data: unknown, fallback: T, key: string): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  console.warn(`[settings] ${key} is malformed; using the safe default.`);
  return fallback;
}

/**
 * Every setting checkout needs, in one read. Falls back to the defaults above
 * on a missing row, malformed JSON, or an unreachable database — the same
 * degrade-rather-than-throw rule the storefront read models follow, for the
 * same reason: a settings row should never be able to take checkout down.
 */
export async function readCheckoutSettings(): Promise<CheckoutSettings> {
  let rows: { key: string; data: unknown }[] = [];

  try {
    rows = await db.setting.findMany({
      where: { key: { in: [SETTING_KEYS.cod, SETTING_KEYS.shipping] } },
      select: { key: true, data: true },
    });
  } catch (error) {
    console.warn('[settings] unavailable; using safe defaults:', error);
  }

  const byKey = new Map(rows.map((row) => [row.key, row.data]));
  const codRow = byKey.get(SETTING_KEYS.cod);
  const shippingRow = byKey.get(SETTING_KEYS.shipping);

  return {
    cod:
      codRow === undefined
        ? DEFAULT_COD_SETTINGS
        : parseOr(codSettingsSchema, codRow, DEFAULT_COD_SETTINGS, SETTING_KEYS.cod),
    shipping:
      shippingRow === undefined
        ? DEFAULT_SHIPPING_SETTINGS
        : parseOr(
            shippingSettingsSchema,
            shippingRow,
            DEFAULT_SHIPPING_SETTINGS,
            SETTING_KEYS.shipping,
          ),
    shippingUnconfigured: shippingRow === undefined,
  };
}

/** Upsert one settings row. The caller has already checked the role and validated the input. */
export async function writeSetting(key: SettingKey, data: object): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, data: data as object },
    update: { data: data as object },
  });
}
