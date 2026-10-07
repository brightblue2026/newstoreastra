'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { parseRupeesToPaise } from '@/lib/money';
import { requireAdministrator } from '@/lib/session';
import {
  SETTING_KEYS,
  codSettingsSchema,
  readCheckoutSettings,
  shippingSettingsSchema,
  writeSetting,
} from '@/lib/settings';
import { listPickupLocations } from '@/lib/shiprocket';

/*
  Settings — ADMIN only, per §6: "user management, settings, financial reports,
  audit log". `requireAdministrator` is checked in every action here, not only in
  the layout, because hiding a screen is not access control.

  These three forms exist because three of §14's open questions turned out to be
  data entry rather than code:

    - Q6, the duplicate GSTIN across two entities: whoever is legally the seller
      of record is a decision BBTC makes, not a default this codebase can pick.
      So the seller form marks exactly one entity and takes its GSTIN.
    - Q17, the COD fee, bounds and pincode allowlist.
    - Q17 again, the flat-rate weight slabs.

  Every save is audited. A settings change moves money, so "who set the COD fee
  to ₹80" has to be answerable.
*/

export interface SettingsFormState {
  error?: string;
  saved?: string;
}

const RUPEES = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return parseRupeesToPaise(value === '' ? '0' : value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount in rupees, like 40 or 39.50.' });
      return z.NEVER;
    }
  });

/** A textarea or comma-separated field of pincode prefixes → a clean array. */
function parsePrefixes(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ];
}

const codFormSchema = z.object({
  enabled: z.boolean(),
  feePaise: RUPEES,
  minOrderPaise: RUPEES,
  maxOrderPaise: RUPEES,
  pincodeAllowlist: z.array(z.string()),
});

export async function saveCodSettingsAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireAdministrator();

  const parsed = codFormSchema.safeParse({
    enabled: formData.get('enabled') === 'on',
    feePaise: formData.get('feeRupees') ?? '0',
    minOrderPaise: formData.get('minOrderRupees') ?? '0',
    maxOrderPaise: formData.get('maxOrderRupees') ?? '0',
    pincodeAllowlist: parsePrefixes(formData.get('pincodeAllowlist')),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the values and try again.' };
  }

  // Zero is not a maximum. An empty maximum means "no ceiling", which is what
  // the schema default expresses as MAX_PAISE.
  const maxOrderPaise = parsed.data.maxOrderPaise === 0 ? 1_000_000_000 : parsed.data.maxOrderPaise;

  if (maxOrderPaise < parsed.data.minOrderPaise) {
    return { error: 'The maximum order value cannot be below the minimum.' };
  }

  const validated = codSettingsSchema.safeParse({ ...parsed.data, maxOrderPaise });
  if (!validated.success) {
    return {
      error:
        validated.error.issues[0]?.message ??
        'One of those pincodes is not a pincode or a pincode prefix.',
    };
  }

  const before = await db.setting.findUnique({ where: { key: SETTING_KEYS.cod } });
  await writeSetting(SETTING_KEYS.cod, validated.data);

  await recordAudit({
    userId: user.id,
    action: before ? 'update' : 'create',
    entityType: 'Setting',
    entityId: SETTING_KEYS.cod,
    before: before ?? null,
    after: validated.data,
  });

  revalidatePath('/admin/settings');
  return { saved: 'Cash-on-delivery settings saved.' };
}

const slabRowSchema = z.object({
  uptoGrams: z.coerce.number().int().min(1).max(100_000),
  pricePaise: RUPEES,
});

export async function saveShippingSettingsAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireAdministrator();

  // Slab rows arrive as parallel arrays — `upto[]` and `price[]` — which is how
  // a plain HTML form expresses a repeating group without client JavaScript.
  const uptos = formData.getAll('slabUptoGrams');
  const prices = formData.getAll('slabPriceRupees');

  const slabs: { uptoGrams: number; pricePaise: number }[] = [];
  for (let index = 0; index < uptos.length; index += 1) {
    const upto = String(uptos[index] ?? '').trim();
    const price = String(prices[index] ?? '').trim();
    if (upto === '') continue; // A blank row is a row the admin left alone.
    const row = slabRowSchema.safeParse({ uptoGrams: upto, pricePaise: price });
    if (!row.success) {
      return { error: `Row ${index + 1}: ${row.error.issues[0]?.message ?? 'is not valid.'}` };
    }
    slabs.push(row.data);
  }

  const duplicateBound = slabs.find(
    (slab, index) => slabs.findIndex((other) => other.uptoGrams === slab.uptoGrams) !== index,
  );
  if (duplicateBound) {
    return { error: `Two slabs both end at ${duplicateBound.uptoGrams} g.` };
  }

  const overflow = RUPEES.safeParse(formData.get('overflowPriceRupees') ?? '0');
  const defaultUnit = z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000)
    .safeParse(formData.get('defaultUnitGrams') ?? '0');

  if (!overflow.success || !defaultUnit.success) {
    return { error: 'Check the overflow price and the assumed unit weight.' };
  }

  // The Shiprocket fields share this settings row but have their own form.
  // Carried over, or every save of the slab table would blank them.
  const { shipping: current } = await readCheckoutSettings();

  const validated = shippingSettingsSchema.safeParse({
    ...current,
    slabs,
    overflowPricePaise: overflow.data,
    defaultUnitGrams: defaultUnit.data,
    serviceablePincodePrefixes: parsePrefixes(formData.get('serviceablePincodePrefixes')),
  });

  if (!validated.success) {
    return {
      error:
        validated.error.issues[0]?.message ??
        'One of those pincodes is not a pincode or a pincode prefix.',
    };
  }

  const before = await db.setting.findUnique({ where: { key: SETTING_KEYS.shipping } });
  await writeSetting(SETTING_KEYS.shipping, validated.data);

  await recordAudit({
    userId: user.id,
    action: before ? 'update' : 'create',
    entityType: 'Setting',
    entityId: SETTING_KEYS.shipping,
    before: before ?? null,
    after: validated.data,
  });

  revalidatePath('/admin/settings');
  return { saved: 'Delivery rates saved.' };
}

const shiprocketFormSchema = z.object({
  shiprocketPickupLocation: z.string().trim().max(120),
  originPincode: z.union([z.string().trim().regex(/^[1-9][0-9]{5}$/), z.literal('')]),
  preferLiveRates: z.boolean(),
  autoPushOrders: z.boolean(),
});

/**
 * The Shiprocket half of the shipping settings: which pickup point orders are
 * pushed from, its pincode, and whether checkout asks for live rates.
 *
 * When Shiprocket is reachable, the pickup name must be one the account
 * actually has and the pincode is taken from it — a typed pincode that
 * disagreed with the pickup address would quote rates from the wrong place.
 */
export async function saveShiprocketSettingsAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireAdministrator();

  const parsed = shiprocketFormSchema.safeParse({
    shiprocketPickupLocation: formData.get('shiprocketPickupLocation') ?? '',
    originPincode: formData.get('originPincode') ?? '',
    preferLiveRates: formData.get('preferLiveRates') === 'on',
    autoPushOrders: formData.get('autoPushOrders') === 'on',
  });
  if (!parsed.success) {
    return { error: 'Enter the full six-digit pincode parcels ship from, like 682030.' };
  }

  const { shiprocketPickupLocation } = parsed.data;
  let { originPincode } = parsed.data;
  const locations = await listPickupLocations();
  if (locations && shiprocketPickupLocation) {
    const match = locations.find((location) => location.name === shiprocketPickupLocation);
    if (!match) {
      return {
        error: `Shiprocket has no pickup location called "${shiprocketPickupLocation}". Choose one from the list.`,
      };
    }
    if (/^[1-9][0-9]{5}$/.test(match.pincode)) originPincode = match.pincode;
  }

  if (parsed.data.preferLiveRates && !originPincode) {
    return { error: 'Live rates need the pickup pincode — set it, or leave live rates off.' };
  }

  const { shipping: current } = await readCheckoutSettings();
  const validated = shippingSettingsSchema.safeParse({
    ...current,
    shiprocketPickupLocation,
    originPincode,
    preferLiveRates: parsed.data.preferLiveRates,
    autoPushOrders: parsed.data.autoPushOrders,
  });
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? 'Check the values and try again.' };
  }

  const before = await db.setting.findUnique({ where: { key: SETTING_KEYS.shipping } });
  await writeSetting(SETTING_KEYS.shipping, validated.data);

  await recordAudit({
    userId: user.id,
    action: before ? 'update' : 'create',
    entityType: 'Setting',
    entityId: SETTING_KEYS.shipping,
    before: before ?? null,
    after: validated.data,
  });

  revalidatePath('/admin/settings');
  return { saved: 'Shiprocket settings saved.' };
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

const sellerSchema = z.object({
  entityId: z.string().trim().min(1, 'Choose the entity that sells online.'),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN_PATTERN, 'A GSTIN is 15 characters, like 32AAICB5392H1ZN.'),
});

/**
 * Set the seller of record — the answer to §14 Q6.
 *
 * Exactly one entity may hold it, so this clears the flag everywhere else in the
 * same transaction. That is what makes `resolveSellerEntity`'s "exactly one"
 * check something the UI cannot violate rather than something it hopes for.
 *
 * The GSTIN is checked against the government's 15-character format. It is not
 * checked for uniqueness across entities on purpose: the *published* duplicate
 * is the open question, and the resolution is that only one entity is the seller
 * — what the others carry stops mattering for invoicing.
 */
export async function saveSellerEntityAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireAdministrator();

  const parsed = sellerSchema.safeParse({
    entityId: formData.get('entityId'),
    gstin: formData.get('gstin'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the values and try again.' };
  }

  const entity = await db.entity.findUnique({ where: { id: parsed.data.entityId } });
  if (!entity) return { error: 'That entity no longer exists.' };
  if (!entity.isActive) return { error: 'An inactive entity cannot be the seller of record.' };

  const updated = await db.$transaction(async (tx) => {
    await tx.entity.updateMany({
      where: { isSeller: true, id: { not: entity.id } },
      data: { isSeller: false },
    });
    return tx.entity.update({
      where: { id: entity.id },
      data: { isSeller: true, gstin: parsed.data.gstin },
    });
  });

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Entity',
    entityId: updated.id,
    before: entity,
    after: updated,
  });

  revalidatePath('/admin/settings');
  return { saved: `${updated.legalName} is now the seller of record.` };
}
