'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { MoneyError, parseRupeesToPaise } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { parseBoxSize } from '../box-size';

export interface ComboFormState {
  error?: string;
  fieldErrors?: Partial<Record<'name' | 'slug' | 'shortDesc' | 'pricePaise' | 'weightGrams' | 'box', string>>;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const comboSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, 'Slug must be lowercase letters, numbers and hyphens only.'),
  shortDesc: z.string().trim().min(1, 'Short description is required.').max(300),
  description: z.string().trim().min(1, 'Description is required.'),
  imageUrl: z.string().trim().max(500).optional().or(z.literal('')),
  priceRupees: z.string().trim().min(1, 'Package price is required.').max(20),
  isFeatured: z.coerce.boolean().optional(),
});

function parseComboForm(formData: FormData) {
  return comboSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    shortDesc: formData.get('shortDesc'),
    description: formData.get('description'),
    imageUrl: formData.get('imageUrl'),
    priceRupees: formData.get('priceRupees'),
    isFeatured: formData.get('isFeatured') === 'on',
  });
}

function fieldErrorsFrom(error: z.ZodError): ComboFormState['fieldErrors'] {
  const out: ComboFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === 'name' || key === 'slug' || key === 'shortDesc') {
      out[key] ??= issue.message;
    }
  }
  return out;
}

/**
 * Optional shipping overrides: a combo that ships in its own carton declares
 * that carton; left empty, its components' weights and boxes are used.
 */
function parseComboShipping(
  formData: FormData,
):
  | {
      ok: true;
      data: {
        weightGrams: number | null;
        lengthCm: number | null;
        breadthCm: number | null;
        heightCm: number | null;
      };
    }
  | { ok: false; fieldErrors: NonNullable<ComboFormState['fieldErrors']> } {
  const rawWeight = formData.get('weightGrams');
  const weightText = typeof rawWeight === 'string' ? rawWeight.trim() : '';
  let weightGrams: number | null = null;
  if (weightText) {
    const value = Number(weightText);
    if (!Number.isInteger(value) || value < 1 || value > 100_000) {
      return { ok: false, fieldErrors: { weightGrams: 'Enter a whole number of grams.' } };
    }
    weightGrams = value;
  }

  const box = parseBoxSize(formData);
  if (!box.ok) return { ok: false, fieldErrors: { box: box.error } };

  return { ok: true, data: { weightGrams, ...box.box } };
}

export async function createComboAction(
  _previous: ComboFormState,
  formData: FormData,
): Promise<ComboFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseComboForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  let pricePaise: number;
  try {
    pricePaise = parseRupeesToPaise(parsed.data.priceRupees);
  } catch (error) {
    const message = error instanceof MoneyError ? error.message : 'Enter a valid amount.';
    return { error: message, fieldErrors: { pricePaise: message } };
  }

  const shipping = parseComboShipping(formData);
  if (!shipping.ok) {
    return { error: 'Check the highlighted fields.', fieldErrors: shipping.fieldErrors };
  }

  const data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    shortDesc: parsed.data.shortDesc,
    description: parsed.data.description,
    imageUrl: parsed.data.imageUrl || null,
    pricePaise,
    isFeatured: Boolean(parsed.data.isFeatured),
    ...shipping.data,
    // Starts as a draft — a combo with no items is meaningless. Publish once
    // items are added, same as products.
    isActive: false,
  };

  let created;
  try {
    created = await db.combo.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'Combo',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath('/admin/combos');
  redirect('/admin/combos');
}

export async function updateComboAction(
  comboId: string,
  _previous: ComboFormState,
  formData: FormData,
): Promise<ComboFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseComboForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await db.combo.findUnique({ where: { id: comboId } });
  if (!existing) {
    return { error: 'That combo no longer exists.' };
  }

  let pricePaise: number;
  try {
    pricePaise = parseRupeesToPaise(parsed.data.priceRupees);
  } catch (error) {
    const message = error instanceof MoneyError ? error.message : 'Enter a valid amount.';
    return { error: message, fieldErrors: { pricePaise: message } };
  }

  const shipping = parseComboShipping(formData);
  if (!shipping.ok) {
    return { error: 'Check the highlighted fields.', fieldErrors: shipping.fieldErrors };
  }

  const data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    shortDesc: parsed.data.shortDesc,
    description: parsed.data.description,
    imageUrl: parsed.data.imageUrl || null,
    pricePaise,
    isFeatured: Boolean(parsed.data.isFeatured),
    ...shipping.data,
  };

  let updated;
  try {
    updated = await db.combo.update({ where: { id: comboId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Combo',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/combos');
  redirect('/admin/combos');
}

export async function setComboActiveAction(comboId: string, isActive: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.combo.findUnique({ where: { id: comboId }, include: { items: true } });
  if (!existing) return;

  if (isActive && existing.items.length === 0) {
    // See the equivalent guard in products/actions.ts — redirected rather
    // than thrown, so the message survives Next's production redaction of
    // thrown server-action errors instead of becoming a blank error page.
    redirect(
      `/admin/combos?publishError=${encodeURIComponent('Cannot publish: add at least one component first.')}`,
    );
  }

  const updated = await db.combo.update({ where: { id: comboId }, data: { isActive } });

  await recordAudit({
    userId: user.id,
    action: isActive ? 'reactivate' : 'deactivate',
    entityType: 'Combo',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/combos');
}
