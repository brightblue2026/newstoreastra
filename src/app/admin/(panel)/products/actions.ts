'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { type FoodLabel, foodLabelIncomplete, parseClaims, parseSteps, readFoodLabel } from './format';

export interface ProductFormState {
  error?: string;
  fieldErrors?: Partial<
    Record<'name' | 'slug' | 'brandId' | 'categoryId' | 'shortDesc' | 'description' | 'gstRatePercent' | 'foodLabel', string>
  >;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, 'Slug must be lowercase letters, numbers and hyphens only.'),
  brandId: z.string().trim().min(1, 'Choose a brand.'),
  categoryId: z.string().trim().min(1, 'Choose a category.'),
  shortDesc: z.string().trim().min(1, 'Short description is required.').max(300),
  description: z.string().trim().min(1, 'Description is required.'),
  hsnCode: z.string().trim().max(20).optional().or(z.literal('')),
  gstRatePercent: z
    .string()
    .trim()
    .max(10)
    .optional()
    .or(z.literal(''))
    .refine(
      (value) => !value || (!Number.isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 100),
      { message: 'Enter a GST rate between 0 and 100.' },
    ),
  claims: z.string().optional().or(z.literal('')),
  ingredients: z.string().trim().optional().or(z.literal('')),
  usageSteps: z.string().optional().or(z.literal('')),
  isFoodProduct: z.coerce.boolean().optional(),
  isCosmetic: z.coerce.boolean().optional(),
  netQty: z.string().trim().max(60).optional().or(z.literal('')),
  batch: z.string().trim().max(60).optional().or(z.literal('')),
  mfgDate: z.string().trim().max(30).optional().or(z.literal('')),
  bestBefore: z.string().trim().max(60).optional().or(z.literal('')),
  vegMark: z.string().trim().max(20).optional().or(z.literal('')),
  nutrition: z.string().trim().max(2000).optional().or(z.literal('')),
  allergens: z.string().trim().max(500).optional().or(z.literal('')),
  isFeatured: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  metaTitle: z.string().trim().max(70).optional().or(z.literal('')),
  metaDesc: z.string().trim().max(160).optional().or(z.literal('')),
});

function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    brandId: formData.get('brandId'),
    categoryId: formData.get('categoryId'),
    shortDesc: formData.get('shortDesc'),
    description: formData.get('description'),
    hsnCode: formData.get('hsnCode'),
    gstRatePercent: formData.get('gstRatePercent'),
    claims: formData.get('claims'),
    ingredients: formData.get('ingredients'),
    usageSteps: formData.get('usageSteps'),
    isFoodProduct: formData.get('isFoodProduct') === 'on',
    isCosmetic: formData.get('isCosmetic') === 'on',
    netQty: formData.get('netQty'),
    batch: formData.get('batch'),
    mfgDate: formData.get('mfgDate'),
    bestBefore: formData.get('bestBefore'),
    vegMark: formData.get('vegMark'),
    nutrition: formData.get('nutrition'),
    allergens: formData.get('allergens'),
    isFeatured: formData.get('isFeatured') === 'on',
    sortOrder: formData.get('sortOrder'),
    metaTitle: formData.get('metaTitle'),
    metaDesc: formData.get('metaDesc'),
  });
}

function fieldErrorsFrom(error: z.ZodError): ProductFormState['fieldErrors'] {
  const out: ProductFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === 'name' ||
      key === 'slug' ||
      key === 'brandId' ||
      key === 'categoryId' ||
      key === 'shortDesc' ||
      key === 'description' ||
      key === 'gstRatePercent'
    ) {
      out[key] ??= issue.message;
    }
  }
  return out;
}

/**
 * §7: `foodLabel` (netQty, batch, mfgDate, bestBefore, vegMark, nutrition,
 * allergens) is required once a product is marked as food. This is a
 * lighter-weight check than the full Phase 1 publish guard (item 8, which
 * also needs a variant and an image to exist) — those arrive with variants
 * and image upload.
 */
function buildFoodLabel(data: z.infer<typeof productSchema>): FoodLabel | null {
  if (!data.isFoodProduct) return null;

  return {
    netQty: data.netQty || '',
    batch: data.batch || '',
    mfgDate: data.mfgDate || '',
    bestBefore: data.bestBefore || '',
    vegMark: data.vegMark || '',
    nutrition: data.nutrition || '',
    allergens: data.allergens || '',
  };
}

async function loadReferenceOrError(
  brandId: string,
  categoryId: string,
): Promise<ProductFormState | null> {
  const [brand, category] = await Promise.all([
    db.brand.findUnique({ where: { id: brandId } }),
    db.category.findUnique({ where: { id: categoryId } }),
  ]);
  if (!brand) {
    return { error: 'Choose a valid brand.', fieldErrors: { brandId: 'That brand no longer exists.' } };
  }
  if (!category) {
    return {
      error: 'Choose a valid category.',
      fieldErrors: { categoryId: 'That category no longer exists.' },
    };
  }
  return null;
}

export async function createProductAction(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const refError = await loadReferenceOrError(parsed.data.brandId, parsed.data.categoryId);
  if (refError) return refError;

  const foodLabel = buildFoodLabel(parsed.data);
  if (foodLabelIncomplete(foodLabel)) {
    return {
      error: 'A food product needs every FSSAI label field filled in.',
      fieldErrors: { foodLabel: 'Complete all food label fields.' },
    };
  }

  const data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    brandId: parsed.data.brandId,
    categoryId: parsed.data.categoryId,
    shortDesc: parsed.data.shortDesc,
    description: parsed.data.description,
    hsnCode: parsed.data.hsnCode || null,
    gstRate:
      parsed.data.gstRatePercent === '' || parsed.data.gstRatePercent === undefined
        ? null
        : Math.round(Number(parsed.data.gstRatePercent) * 100),
    claims: parseClaims(parsed.data.claims || '') as unknown as Prisma.InputJsonValue,
    ingredients: parsed.data.ingredients || null,
    usageSteps: parsed.data.usageSteps ? parseSteps(parsed.data.usageSteps) : Prisma.JsonNull,
    isFoodProduct: Boolean(parsed.data.isFoodProduct),
    isCosmetic: Boolean(parsed.data.isCosmetic),
    foodLabel: foodLabel === null ? Prisma.JsonNull : (foodLabel as unknown as Prisma.InputJsonValue),
    isFeatured: Boolean(parsed.data.isFeatured),
    sortOrder: parsed.data.sortOrder,
    metaTitle: parsed.data.metaTitle || null,
    metaDesc: parsed.data.metaDesc || null,
    // Starts inactive. The full publish guard (variant + image + price + HSN
    // + food/cosmetic label) lands with variants and image upload; until
    // then a product cannot go live from this screen.
    isActive: false,
  };

  let created;
  try {
    created = await db.product.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'Product',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath('/admin/products');
  redirect('/admin/products');
}

export async function updateProductAction(
  productId: string,
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await db.product.findUnique({ where: { id: productId } });
  if (!existing) {
    return { error: 'That product no longer exists.' };
  }

  const refError = await loadReferenceOrError(parsed.data.brandId, parsed.data.categoryId);
  if (refError) return refError;

  const foodLabel = buildFoodLabel(parsed.data);
  if (foodLabelIncomplete(foodLabel)) {
    return {
      error: 'A food product needs every FSSAI label field filled in.',
      fieldErrors: { foodLabel: 'Complete all food label fields.' },
    };
  }

  const data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    brandId: parsed.data.brandId,
    categoryId: parsed.data.categoryId,
    shortDesc: parsed.data.shortDesc,
    description: parsed.data.description,
    hsnCode: parsed.data.hsnCode || null,
    gstRate:
      parsed.data.gstRatePercent === '' || parsed.data.gstRatePercent === undefined
        ? null
        : Math.round(Number(parsed.data.gstRatePercent) * 100),
    claims: parseClaims(parsed.data.claims || '') as unknown as Prisma.InputJsonValue,
    ingredients: parsed.data.ingredients || null,
    usageSteps: parsed.data.usageSteps ? parseSteps(parsed.data.usageSteps) : Prisma.JsonNull,
    isFoodProduct: Boolean(parsed.data.isFoodProduct),
    isCosmetic: Boolean(parsed.data.isCosmetic),
    foodLabel: foodLabel === null ? Prisma.JsonNull : (foodLabel as unknown as Prisma.InputJsonValue),
    isFeatured: Boolean(parsed.data.isFeatured),
    sortOrder: parsed.data.sortOrder,
    metaTitle: parsed.data.metaTitle || null,
    metaDesc: parsed.data.metaDesc || null,
  };

  let updated;
  try {
    updated = await db.product.update({ where: { id: productId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Product',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/products');
  redirect('/admin/products');
}

export async function setProductActiveAction(productId: string, isActive: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.product.findUnique({
    where: { id: productId },
    include: { variants: { include: { images: true } }, images: true },
  });
  if (!existing) return;

  // The full Phase 1 publish guard: a variant, an image somewhere on the
  // product or one of its variants, an HSN code, and — for food — a complete
  // label. Deactivating never needs the guard.
  if (isActive) {
    const hasVariant = existing.variants.length > 0;
    const hasImage = existing.images.length > 0 || existing.variants.some((v) => v.images.length > 0);
    const hasHsn = Boolean(existing.hsnCode);
    const foodOk =
      !existing.isFoodProduct || !foodLabelIncomplete(readFoodLabel(existing.foodLabel));

    if (!hasVariant || !hasImage || !hasHsn || !foodOk) {
      throw new Error(
        'Cannot publish: needs at least one variant, one image, an HSN code' +
          (existing.isFoodProduct ? ', and a complete food label.' : '.'),
      );
    }
  }

  const updated = await db.product.update({ where: { id: productId }, data: { isActive } });

  await recordAudit({
    userId: user.id,
    action: isActive ? 'reactivate' : 'deactivate',
    entityType: 'Product',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/products');
}
