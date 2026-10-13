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

const idSchema = z.string().trim().min(1).max(64);

/** The page a publish button was pressed on, and so the page to land back on. */
const returnToSchema = z.enum(['list', 'edit', 'photos']);

function variantPagePath(
  productId: string,
  variantId: string,
  returnTo: z.infer<typeof returnToSchema>,
): string {
  const list = `/admin/products/${productId}/variants`;
  if (returnTo === 'edit') return `${list}/${variantId}`;
  if (returnTo === 'photos') return `${list}/${variantId}/photos`;
  return list;
}

const setVariantActiveSchema = z.object({
  productId: idSchema,
  variantId: idSchema,
  isActive: z.boolean(),
  returnTo: returnToSchema,
});

/**
 * Publish or unpublish one variant — the same button, pending state and
 * said-back result as publishing a product.
 *
 * A refusal is a redirect with a notice kind, never a thrown error: Next
 * redacts a thrown message in a production build, which would leave the admin
 * looking at a blank error page instead of the reason.
 */
export async function setVariantActiveAction(
  productId: string,
  variantId: string,
  isActive: boolean,
  returnTo: 'list' | 'edit' | 'photos' = 'list',
): Promise<void> {
  const user = await requireCatalogueAccess();

  const parsed = setVariantActiveSchema.safeParse({ productId, variantId, isActive, returnTo });
  if (!parsed.success) return;

  const found = await db.productVariant.findUnique({
    where: { id: parsed.data.variantId },
    include: { product: { select: { isActive: true } } },
  });
  if (!found || found.productId !== parsed.data.productId) return;
  const { product, ...existing } = found;

  const back = variantPagePath(existing.productId, existing.id, parsed.data.returnTo);
  const landing = (kind: string) => `${back}?notice=${kind}&variant=${existing.id}`;

  // A product on the store must keep something a customer can choose.
  if (!parsed.data.isActive && existing.isActive && product.isActive) {
    const otherPublished = await db.productVariant.count({
      where: { productId: existing.productId, isActive: true, id: { not: existing.id } },
    });
    if (otherPublished === 0) redirect(landing('last'));
  }

  const updated = await db.productVariant.update({
    where: { id: existing.id },
    data: { isActive: parsed.data.isActive },
  });

  await recordAudit({
    userId: user.id,
    action: parsed.data.isActive ? 'reactivate' : 'deactivate',
    entityType: 'ProductVariant',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  // The shop lists and prices by published variant, so it changes with this
  // one — but only a published product is on the shop at all.
  if (product.isActive) revalidatePath('/', 'layout');
  revalidatePath('/admin/products');
  revalidatePath(`/admin/products/${existing.productId}`, 'layout');
  redirect(landing(parsed.data.isActive ? 'published' : 'unpublished'));
}

/**
 * Publish or unpublish every variant of a product at once. MX-3 alone has
 * ninety-six; nobody should press a button that many times.
 */
export async function setAllVariantsActiveAction(productId: string, isActive: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const parsed = z.object({ productId: idSchema, isActive: z.boolean() }).safeParse({ productId, isActive });
  if (!parsed.success) return;

  const product = await db.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, isActive: true },
  });
  if (!product) return;

  const list = `/admin/products/${product.id}/variants`;

  // Same rule as for one variant: unpublish the product itself first.
  if (!parsed.data.isActive && product.isActive) redirect(`${list}?notice=all-last`);

  const changed = await db.productVariant.updateMany({
    where: { productId: product.id, isActive: !parsed.data.isActive },
    data: { isActive: parsed.data.isActive },
  });

  if (changed.count > 0) {
    await recordAudit({
      userId: user.id,
      action: parsed.data.isActive ? 'reactivate' : 'deactivate',
      entityType: 'Product',
      entityId: product.id,
      before: { variantsPublished: !parsed.data.isActive, variantsChanged: changed.count },
      after: { variantsPublished: parsed.data.isActive, variantsChanged: changed.count },
    });
  }

  if (product.isActive) revalidatePath('/', 'layout');
  revalidatePath('/admin/products');
  revalidatePath(`/admin/products/${product.id}`, 'layout');
  redirect(`${list}?notice=${parsed.data.isActive ? 'all-published' : 'all-unpublished'}`);
}
