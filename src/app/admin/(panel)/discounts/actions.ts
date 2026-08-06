'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { DiscountScope, DiscountType } from '@/generated/prisma/enums';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { MoneyError, parseRupeesToPaise } from '@/lib/money';
import { calculateCart, type CartLine, type DiscountInput, type PriceResult } from '@/lib/pricing';
import { requireCatalogueAccess } from '@/lib/session';

export interface DiscountFormState {
  error?: string;
  fieldErrors?: Partial<
    Record<
      | 'name'
      | 'code'
      | 'type'
      | 'scope'
      | 'valuePercent'
      | 'valueRupees'
      | 'buyQty'
      | 'getQty'
      | 'tiers'
      | 'minOrderRupees'
      | 'maxDiscountRupees'
      | 'startsAt'
      | 'endsAt'
      | 'targetIds',
      string
    >
  >;
}

/** Coupon codes are customer-facing and end up in URLs — keep the charset boring. */
const CODE_PATTERN = /^[A-Z0-9-]+$/;

/** One "minQty:percent" per line, e.g. "3:10". */
function parseTiers(raw: string): Array<{ minQty: number; valueBps: number }> | null {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const tiers: Array<{ minQty: number; valueBps: number }> = [];
  for (const line of lines) {
    const match = /^(\d+)\s*:\s*(\d+(?:\.\d+)?)$/.exec(line);
    if (!match) throw new Error(`"${line}" is not "minQty:percent", e.g. "3:10".`);
    const minQty = Number(match[1]);
    const percent = Number(match[2]);
    if (minQty < 1) throw new Error('Tier quantity must be at least 1.');
    if (percent < 0 || percent > 100) throw new Error('Tier percentage must be 0-100.');
    tiers.push({ minQty, valueBps: Math.round(percent * 100) });
  }
  tiers.sort((a, b) => a.minQty - b.minQty);
  return tiers;
}

const discountSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(120),
    publicLabel: z.string().trim().max(120).optional().or(z.literal('')),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .max(40)
      .optional()
      .or(z.literal(''))
      .refine((value) => !value || CODE_PATTERN.test(value), {
        message: 'Code must be uppercase letters, numbers and hyphens only.',
      }),
    type: z.enum(Object.values(DiscountType) as [DiscountType, ...DiscountType[]], {
      message: 'Choose a discount type.',
    }),
    scope: z.enum(Object.values(DiscountScope) as [DiscountScope, ...DiscountScope[]], {
      message: 'Choose a scope.',
    }),
    valuePercent: z.string().trim().max(10).optional().or(z.literal('')),
    valueRupees: z.string().trim().max(20).optional().or(z.literal('')),
    buyQty: z.string().trim().max(6).optional().or(z.literal('')),
    getQty: z.string().trim().max(6).optional().or(z.literal('')),
    tiers: z.string().optional().or(z.literal('')),
    minOrderRupees: z.string().trim().max(20).optional().or(z.literal('')),
    maxDiscountRupees: z.string().trim().max(20).optional().or(z.literal('')),
    usageLimit: z.string().trim().max(10).optional().or(z.literal('')),
    perCustomerLimit: z.string().trim().max(10).optional().or(z.literal('')),
    stackable: z.coerce.boolean().optional(),
    priority: z.coerce.number().int().min(0).max(9999).default(0),
    startsAt: z.string().trim().min(1, 'Start date is required.'),
    endsAt: z.string().trim().optional().or(z.literal('')),
    targetIds: z.array(z.string()).optional().default([]),
  })
  .refine((data) => !data.endsAt || new Date(data.endsAt) > new Date(data.startsAt), {
    message: 'End date must be after the start date.',
    path: ['endsAt'],
  });

function parseDiscountForm(formData: FormData) {
  return discountSchema.safeParse({
    name: formData.get('name'),
    publicLabel: formData.get('publicLabel'),
    code: formData.get('code'),
    type: formData.get('type'),
    scope: formData.get('scope'),
    valuePercent: formData.get('valuePercent'),
    valueRupees: formData.get('valueRupees'),
    buyQty: formData.get('buyQty'),
    getQty: formData.get('getQty'),
    tiers: formData.get('tiers'),
    minOrderRupees: formData.get('minOrderRupees'),
    maxDiscountRupees: formData.get('maxDiscountRupees'),
    usageLimit: formData.get('usageLimit'),
    perCustomerLimit: formData.get('perCustomerLimit'),
    stackable: formData.get('stackable') === 'on',
    priority: formData.get('priority'),
    startsAt: formData.get('startsAt'),
    endsAt: formData.get('endsAt'),
    targetIds: formData.getAll('targetIds'),
  });
}

function fieldErrorsFrom(error: z.ZodError): DiscountFormState['fieldErrors'] {
  const out: DiscountFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === 'name' ||
      key === 'code' ||
      key === 'type' ||
      key === 'scope' ||
      key === 'startsAt' ||
      key === 'endsAt'
    ) {
      out[key as keyof NonNullable<DiscountFormState['fieldErrors']>] ??= issue.message;
    }
  }
  return out;
}

function parseOptionalRupees(raw: string | undefined): number | null {
  if (!raw) return null;
  return parseRupeesToPaise(raw);
}

function parseOptionalInt(raw: string | undefined, label: string): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number.`);
  }
  return value;
}

/**
 * Builds the type-specific fields. Each `DiscountType` uses a different
 * subset of the row — brief §12 Phase 4: "form adapting per type."
 */
function buildTypeFields(
  data: z.infer<typeof discountSchema>,
): {
  valuePaise: number | null;
  valueBps: number | null;
  tiers: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  buyQty: number | null;
  getQty: number | null;
} {
  switch (data.type) {
    case DiscountType.PERCENTAGE: {
      if (!data.valuePercent) throw new Error('Enter a percentage.');
      const percent = Number(data.valuePercent);
      if (Number.isNaN(percent) || percent <= 0 || percent > 100) {
        throw new Error('Percentage must be between 0 and 100.');
      }
      return {
        valuePaise: null,
        valueBps: Math.round(percent * 100),
        tiers: Prisma.JsonNull,
        buyQty: null,
        getQty: null,
      };
    }
    case DiscountType.FIXED_AMOUNT: {
      if (!data.valueRupees) throw new Error('Enter an amount.');
      return {
        valuePaise: parseRupeesToPaise(data.valueRupees),
        valueBps: null,
        tiers: Prisma.JsonNull,
        buyQty: null,
        getQty: null,
      };
    }
    case DiscountType.BUY_X_GET_Y: {
      const buyQty = parseOptionalInt(data.buyQty, 'Buy quantity');
      const getQty = parseOptionalInt(data.getQty, 'Get quantity');
      if (!buyQty || !getQty) throw new Error('Enter both a buy quantity and a get quantity.');
      return { valuePaise: null, valueBps: null, tiers: Prisma.JsonNull, buyQty, getQty };
    }
    case DiscountType.FREE_SHIPPING: {
      return { valuePaise: null, valueBps: null, tiers: Prisma.JsonNull, buyQty: null, getQty: null };
    }
    case DiscountType.TIERED_QUANTITY: {
      const tiers = parseTiers(data.tiers || '');
      if (!tiers) throw new Error('Enter at least one tier, e.g. "3:10".');
      return {
        valuePaise: null,
        valueBps: null,
        tiers: tiers as unknown as Prisma.InputJsonValue,
        buyQty: null,
        getQty: null,
      };
    }
    default:
      throw new Error('Unknown discount type.');
  }
}

/** `targetIds` must exist in the table the chosen scope points at. */
async function validateTargets(scope: DiscountScope, targetIds: string[]): Promise<string | null> {
  if (scope === DiscountScope.ORDER) return null;
  if (targetIds.length === 0) return 'Choose at least one target for this scope.';

  let count = 0;
  if (scope === DiscountScope.BRAND) {
    count = await db.brand.count({ where: { id: { in: targetIds } } });
  } else if (scope === DiscountScope.CATEGORY) {
    count = await db.category.count({ where: { id: { in: targetIds } } });
  } else if (scope === DiscountScope.PRODUCT) {
    count = await db.product.count({ where: { id: { in: targetIds } } });
  } else if (scope === DiscountScope.COMBO) {
    count = await db.combo.count({ where: { id: { in: targetIds } } });
  }
  if (count !== targetIds.length) return 'One or more selected targets no longer exist.';
  return null;
}

async function buildDiscountData(formData: FormData) {
  const parsed = parseDiscountForm(formData);
  if (!parsed.success) {
    return { state: { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) } as DiscountFormState };
  }

  let typeFields;
  try {
    typeFields = buildTypeFields(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Check the type-specific fields.';
    return { state: { error: message } as DiscountFormState };
  }

  let minOrderPaise: number | null;
  let maxDiscountPaise: number | null;
  try {
    minOrderPaise = parseOptionalRupees(parsed.data.minOrderRupees);
    maxDiscountPaise = parseOptionalRupees(parsed.data.maxDiscountRupees);
  } catch (error) {
    const message = error instanceof MoneyError ? error.message : 'Enter a valid amount.';
    return { state: { error: message } as DiscountFormState };
  }

  const targetError = await validateTargets(parsed.data.scope, parsed.data.targetIds);
  if (targetError) {
    return {
      state: { error: targetError, fieldErrors: { targetIds: targetError } } as DiscountFormState,
    };
  }

  const usageLimit = parsed.data.usageLimit ? Number(parsed.data.usageLimit) : null;
  const perCustomerLimit = parsed.data.perCustomerLimit ? Number(parsed.data.perCustomerLimit) : null;

  const data = {
    name: parsed.data.name,
    publicLabel: parsed.data.publicLabel || null,
    code: parsed.data.code || null,
    type: parsed.data.type,
    scope: parsed.data.scope,
    ...typeFields,
    minOrderPaise,
    maxDiscountPaise,
    targetIds: parsed.data.scope === DiscountScope.ORDER ? [] : parsed.data.targetIds,
    usageLimit,
    perCustomerLimit,
    stackable: Boolean(parsed.data.stackable),
    priority: parsed.data.priority,
    startsAt: new Date(parsed.data.startsAt),
    endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
  };

  return { state: null, data };
}

export async function createDiscountAction(
  _previous: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const user = await requireCatalogueAccess();

  const result = await buildDiscountData(formData);
  if (result.state) return result.state;

  let created;
  try {
    created = await db.discount.create({ data: result.data! });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That code is already in use.', fieldErrors: { code: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'Discount',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath('/admin/discounts');
  redirect('/admin/discounts');
}

export async function updateDiscountAction(
  discountId: string,
  _previous: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const user = await requireCatalogueAccess();

  const existing = await db.discount.findUnique({ where: { id: discountId } });
  if (!existing) {
    return { error: 'That discount no longer exists.' };
  }

  const result = await buildDiscountData(formData);
  if (result.state) return result.state;

  let updated;
  try {
    updated = await db.discount.update({ where: { id: discountId }, data: result.data! });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That code is already in use.', fieldErrors: { code: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Discount',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/discounts');
  redirect('/admin/discounts');
}

export type DiscountPreviewResult =
  | { ok: true; result: PriceResult }
  | { ok: false; error: string };

/**
 * §12 Phase 4: "discount preview against a sample cart before save — mandatory."
 *
 * Runs the *unsaved* form fields through `buildDiscountData` — the exact same
 * parsing and validation `createDiscountAction`/`updateDiscountAction` use —
 * so what the admin previews is what would actually be saved, not an
 * approximation of it. `startsAt`/`endsAt` are taken from the form as typed,
 * so a discount that hasn't started yet honestly shows as not applying.
 */
export async function previewDiscountAction(
  formData: FormData,
  sampleLines: Array<{ variantId: string; quantity: number }>,
  settings: { shippingState?: string; paymentMethod: 'RAZORPAY' | 'COD' },
): Promise<DiscountPreviewResult> {
  await requireCatalogueAccess();

  if (sampleLines.length === 0) {
    return { ok: false, error: 'Add at least one line to the sample cart.' };
  }

  const built = await buildDiscountData(formData);
  if (built.state) {
    return { ok: false, error: built.state.error ?? 'Check the discount fields.' };
  }
  const data = built.data!;

  const variants = await db.productVariant.findMany({
    where: { id: { in: sampleLines.map((l) => l.variantId) } },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: CartLine[] = [];
  for (const sample of sampleLines) {
    const variant = byId.get(sample.variantId);
    if (!variant) return { ok: false, error: 'One of the sample lines no longer exists.' };
    if (variant.pricePaise === null) {
      return {
        ok: false,
        error: `${variant.product.name} (${variant.sku}) has no price set — cannot preview.`,
      };
    }
    if (!variant.product.hsnCode) {
      return { ok: false, error: `${variant.product.name} has no HSN code — cannot preview.` };
    }
    lines.push({
      kind: 'VARIANT',
      id: variant.id,
      quantity: sample.quantity,
      unitPricePaise: variant.pricePaise,
      brandId: variant.product.brandId,
      categoryId: variant.product.categoryId,
      productId: variant.productId,
      hsnCode: variant.product.hsnCode,
      gstRate: variant.product.gstRate ?? 0,
    });
  }

  const discountInput: DiscountInput = {
    id: 'preview',
    code: data.code,
    type: data.type,
    scope: data.scope,
    valuePaise: data.valuePaise,
    valueBps: data.valueBps,
    tiers: data.tiers === Prisma.JsonNull ? null : (data.tiers as unknown as DiscountInput['tiers']),
    buyQty: data.buyQty,
    getQty: data.getQty,
    minOrderPaise: data.minOrderPaise,
    maxDiscountPaise: data.maxDiscountPaise,
    targetIds: data.targetIds,
    usageLimit: data.usageLimit,
    usageCount: 0,
    perCustomerLimit: data.perCustomerLimit,
    stackable: data.stackable,
    priority: data.priority,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    isActive: true,
  };

  const result = calculateCart({
    lines,
    discounts: [discountInput],
    discountCode: discountInput.code ?? undefined,
    shippingState: settings.shippingState,
    paymentMethod: settings.paymentMethod,
    now: new Date(),
  });

  return { ok: true, result };
}

export async function setDiscountActiveAction(discountId: string, isActive: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.discount.findUnique({ where: { id: discountId } });
  if (!existing) return;

  const updated = await db.discount.update({ where: { id: discountId }, data: { isActive } });

  await recordAudit({
    userId: user.id,
    action: isActive ? 'reactivate' : 'deactivate',
    entityType: 'Discount',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/discounts');
}
