'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { type FoodLabel, foodLabelIncomplete, parseClaims, parseSteps } from './format';
import { joinList, publishBlockers } from './publish-check';
import { isVariantSkuConflict } from './unique-conflict';
import { parseVariantRowsJson } from './variant-rows';

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
  // `.nullable()` on top of the usual optional-or-empty-string shape: these
  // six only exist in the DOM inside the `isFoodProduct` block in
  // product-form.tsx, so on any non-food product `formData.get(...)` returns
  // `null` for every one of them — not `undefined`, which is all `.optional()`
  // ever accepts. Without it, every non-food product (the overwhelming
  // majority of the catalogue) failed to create or save at all.
  netQty: z.string().trim().max(60).optional().or(z.literal('')).nullable(),
  batch: z.string().trim().max(60).optional().or(z.literal('')).nullable(),
  mfgDate: z.string().trim().max(30).optional().or(z.literal('')).nullable(),
  bestBefore: z.string().trim().max(60).optional().or(z.literal('')).nullable(),
  vegMark: z.string().trim().max(20).optional().or(z.literal('')).nullable(),
  nutrition: z.string().trim().max(2000).optional().or(z.literal('')).nullable(),
  allergens: z.string().trim().max(500).optional().or(z.literal('')).nullable(),
  // Label details. Nullable for the same reason as the food fields: the guided
  // form does not have them, so they arrive as `null`, not `undefined`.
  countryOfOrigin: z.string().trim().max(80).optional().or(z.literal('')).nullable(),
  manufacturerName: z.string().trim().max(200).optional().or(z.literal('')).nullable(),
  manufacturerAddress: z.string().trim().max(500).optional().or(z.literal('')).nullable(),
  shelfLife: z.string().trim().max(120).optional().or(z.literal('')).nullable(),
  safetyWarnings: z.string().trim().max(1000).optional().or(z.literal('')).nullable(),
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
    countryOfOrigin: formData.get('countryOfOrigin'),
    manufacturerName: formData.get('manufacturerName'),
    manufacturerAddress: formData.get('manufacturerAddress'),
    shelfLife: formData.get('shelfLife'),
    safetyWarnings: formData.get('safetyWarnings'),
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

  // Optional — a product can still be created with zero variants and have them added one
  // at a time afterwards, same as before this existed. See `variant-rows.ts`.
  const variantRows = parseVariantRowsJson(formData.get('variantsJson') as string | null);
  if ('error' in variantRows) {
    return { error: variantRows.error };
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
    countryOfOrigin: parsed.data.countryOfOrigin || null,
    manufacturerName: parsed.data.manufacturerName || null,
    manufacturerAddress: parsed.data.manufacturerAddress || null,
    shelfLife: parsed.data.shelfLife || null,
    safetyWarnings: parsed.data.safetyWarnings || null,
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

  let createdProductId = '';

  try {
    // All-or-nothing: a duplicate SKU on row 5 of 20 must not leave rows 1-4 orphaned,
    // and must not leave a product with only half its declared catalogue. Every audit row
    // is written in the same transaction too — a batch of 200 sequential round trips (one
    // create plus one audit write per row) risked tripping Prisma's 5s interactive
    // transaction timeout, and a mid-loop failure used to leave the AuditLog covering only
    // some of a product's committed variants. `createManyAndReturn` is one round trip for
    // every variant row; the audit writes ride along in the same transaction so they can
    // never desync from what actually got created.
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({ data });
      createdProductId = product.id;
      await tx.auditLog.create({
        data: { userId: user.id, action: 'create', entityType: 'Product', entityId: product.id, before: Prisma.JsonNull, after: product },
      });

      if (variantRows.rows.length > 0) {
        const variants = await tx.productVariant.createManyAndReturn({
          data: variantRows.rows.map((row) => ({ productId: product.id, ...row })),
        });
        await tx.auditLog.createMany({
          data: variants.map((variant) => ({
            userId: user.id,
            action: 'create',
            entityType: 'ProductVariant',
            entityId: variant.id,
            before: Prisma.JsonNull,
            after: variant,
          })),
        });
      }

      return product;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Which field clashed is not readable from `meta.target` alone under a
      // driver adapter — see `unique-conflict.ts`. Reading only that shape told
      // the user their web address was taken when a stock code was the real clash.
      if (isVariantSkuConflict(error)) {
        return { error: 'One of the variant stock codes is already in use by another product.' };
      }
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  revalidatePath('/admin/products');

  // The guided screen (`quick-add/`) sends the user straight on to photos, because
  // an image is the one publish requirement it cannot collect itself. This is a
  // fixed destination keyed off a literal, never a caller-supplied path — a
  // redirect target from the form body would be an open redirect.
  if (formData.get('afterCreate') === 'images' && createdProductId) {
    redirect(`/admin/products/${createdProductId}/images?created=1`);
  }

  // The id, never a message: the list looks the product up and words the
  // confirmation itself, so nothing shown there comes from the address bar.
  redirect(
    createdProductId ? `/admin/products?notice=created&product=${createdProductId}` : '/admin/products',
  );
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
    countryOfOrigin: parsed.data.countryOfOrigin || null,
    manufacturerName: parsed.data.manufacturerName || null,
    manufacturerAddress: parsed.data.manufacturerAddress || null,
    shelfLife: parsed.data.shelfLife || null,
    safetyWarnings: parsed.data.safetyWarnings || null,
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

  // The storefront shows the name, description and tax details saved here.
  if (updated.isActive) revalidatePath('/', 'layout');
  revalidatePath('/admin/products');
  redirect(`/admin/products?notice=updated&product=${updated.id}`);
}

export async function setProductActiveAction(productId: string, isActive: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.product.findUnique({
    where: { id: productId },
    include: { variants: { include: { images: true } }, images: true },
  });
  if (!existing) return;

  // The full Phase 1 publish guard — see `publishBlockers`. Deactivating never
  // needs it.
  if (isActive) {
    const missing = publishBlockers(existing);
    if (missing.length > 0) {
      // Redirected with the reason rather than thrown: a thrown Error from a
      // server action has its message redacted in a production build (Next
      // replaces it with an opaque digest), so the admin clicking "Publish"
      // on an incomplete product used to get a blank error page instead of
      // being told what's missing. This survives that redaction because it
      // never throws at all.
      const reason = `Cannot publish "${existing.name}" yet. It still needs ${joinList(missing)}.`;
      revalidatePath('/admin/products');
      redirect(`/admin/products?publishError=${encodeURIComponent(reason)}`);
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

  // Every storefront page that lists products, not only this product's own:
  // without this the shop kept showing the old state for up to a minute, and
  // "did that work?" had no answer.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/products');
  redirect(`/admin/products?notice=${isActive ? 'published' : 'unpublished'}&product=${updated.id}`);
}
