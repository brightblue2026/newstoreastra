'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { MoneyError, parseRupeesToPaise } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { variantFieldsSchema } from '../../variant-fields';
import { parseBoxSize } from '../../../box-size';

export interface VariantFormState {
  error?: string;
  fieldErrors?: Partial<
    Record<'sku' | 'size' | 'variantHex' | 'mrpRupees' | 'priceRupees' | 'wholesaleRupees' | 'weightGrams' | 'box', string>
  >;
}

const variantSchema = variantFieldsSchema;

function parseVariantForm(formData: FormData) {
  return variantSchema.safeParse({
    sku: formData.get('sku'),
    variantName: formData.get('variantName'),
    variantHex: formData.get('variantHex'),
    size: formData.get('size'),
    format: formData.get('format'),
    mrpRupees: formData.get('mrpRupees'),
    priceRupees: formData.get('priceRupees'),
    wholesaleRupees: formData.get('wholesaleRupees'),
    weightGrams: formData.get('weightGrams'),
    barcode: formData.get('barcode'),
  });
}

function fieldErrorsFrom(error: z.ZodError): VariantFormState['fieldErrors'] {
  const out: VariantFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === 'sku' ||
      key === 'size' ||
      key === 'variantHex' ||
      key === 'mrpRupees' ||
      key === 'priceRupees' ||
      key === 'wholesaleRupees' ||
      key === 'weightGrams'
    ) {
      out[key] ??= issue.message;
    }
  }
  return out;
}

/** Parses a rupee-input field. Empty means "not set" (null), never zero. */
function parseOptionalPaise(
  raw: string | undefined,
  field: keyof NonNullable<VariantFormState['fieldErrors']>,
  errors: NonNullable<VariantFormState['fieldErrors']>,
): number | null {
  if (!raw) return null;
  try {
    return parseRupeesToPaise(raw);
  } catch (error) {
    errors[field] = error instanceof MoneyError ? error.message : 'Enter a valid amount.';
    return null;
  }
}

export async function createVariantAction(
  productId: string,
  _previous: VariantFormState,
  formData: FormData,
): Promise<VariantFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseVariantForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) {
    return { error: 'That product no longer exists.' };
  }

  const moneyErrors: NonNullable<VariantFormState['fieldErrors']> = {};
  const mrpPaise = parseOptionalPaise(parsed.data.mrpRupees, 'mrpRupees', moneyErrors);
  const pricePaise = parseOptionalPaise(parsed.data.priceRupees, 'priceRupees', moneyErrors);
  const wholesalePaise = parseOptionalPaise(
    parsed.data.wholesaleRupees,
    'wholesaleRupees',
    moneyErrors,
  );
  if (Object.keys(moneyErrors).length > 0) {
    return { error: 'Check the highlighted fields.', fieldErrors: moneyErrors };
  }

  let weightGrams: number | null = null;
  if (parsed.data.weightGrams) {
    const value = Number(parsed.data.weightGrams);
    if (!Number.isInteger(value) || value < 0) {
      return {
        error: 'Check the highlighted fields.',
        fieldErrors: { weightGrams: 'Enter a whole number of grams.' },
      };
    }
    weightGrams = value;
  }

  const box = parseBoxSize(formData);
  if (!box.ok) {
    return { error: 'Check the highlighted fields.', fieldErrors: { box: box.error } };
  }

  const data = {
    productId,
    sku: parsed.data.sku,
    variantName: parsed.data.variantName || null,
    variantHex: parsed.data.variantHex || null,
    size: parsed.data.size,
    format: parsed.data.format || null,
    mrpPaise,
    pricePaise,
    wholesalePaise,
    weightGrams,
    ...box.box,
    barcode: parsed.data.barcode || null,
  };

  let created;
  try {
    created = await db.productVariant.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That SKU is already in use.', fieldErrors: { sku: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'ProductVariant',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath(`/admin/products/${productId}/variants`);
  redirect(`/admin/products/${productId}/variants`);
}

export async function updateVariantAction(
  productId: string,
  variantId: string,
  _previous: VariantFormState,
  formData: FormData,
): Promise<VariantFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseVariantForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!existing || existing.productId !== productId) {
    return { error: 'That variant no longer exists.' };
  }

  const moneyErrors: NonNullable<VariantFormState['fieldErrors']> = {};
  const mrpPaise = parseOptionalPaise(parsed.data.mrpRupees, 'mrpRupees', moneyErrors);
  const pricePaise = parseOptionalPaise(parsed.data.priceRupees, 'priceRupees', moneyErrors);
  const wholesalePaise = parseOptionalPaise(
    parsed.data.wholesaleRupees,
    'wholesaleRupees',
    moneyErrors,
  );
  if (Object.keys(moneyErrors).length > 0) {
    return { error: 'Check the highlighted fields.', fieldErrors: moneyErrors };
  }

  let weightGrams: number | null = null;
  if (parsed.data.weightGrams) {
    const value = Number(parsed.data.weightGrams);
    if (!Number.isInteger(value) || value < 0) {
      return {
        error: 'Check the highlighted fields.',
        fieldErrors: { weightGrams: 'Enter a whole number of grams.' },
      };
    }
    weightGrams = value;
  }

  const box = parseBoxSize(formData);
  if (!box.ok) {
    return { error: 'Check the highlighted fields.', fieldErrors: { box: box.error } };
  }

  const data = {
    sku: parsed.data.sku,
    variantName: parsed.data.variantName || null,
    variantHex: parsed.data.variantHex || null,
    size: parsed.data.size,
    format: parsed.data.format || null,
    mrpPaise,
    pricePaise,
    wholesalePaise,
    weightGrams,
    ...box.box,
    barcode: parsed.data.barcode || null,
  };

  let updated;
  try {
    updated = await db.productVariant.update({ where: { id: variantId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That SKU is already in use.', fieldErrors: { sku: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'ProductVariant',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath(`/admin/products/${productId}/variants`);
  redirect(`/admin/products/${productId}/variants`);
}

export async function setVariantActiveAction(
  productId: string,
  variantId: string,
  isActive: boolean,
): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!existing || existing.productId !== productId) return;

  const updated = await db.productVariant.update({ where: { id: variantId }, data: { isActive } });

  await recordAudit({
    userId: user.id,
    action: isActive ? 'reactivate' : 'deactivate',
    entityType: 'ProductVariant',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath(`/admin/products/${productId}/variants`);
}
