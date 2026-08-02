'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';

export interface ComboItemFormState {
  error?: string;
  fieldErrors?: Partial<Record<'variantId' | 'quantity' | 'choiceOf', string>>;
}

const itemSchema = z.object({
  variantId: z.string().trim().min(1, 'Choose a variant.'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.').max(999),
  isChoice: z.coerce.boolean().optional(),
  choiceOf: z.array(z.string()).optional().default([]),
});

function parseItemForm(formData: FormData) {
  return itemSchema.safeParse({
    variantId: formData.get('variantId'),
    quantity: formData.get('quantity'),
    isChoice: formData.get('isChoice') === 'on',
    choiceOf: formData.getAll('choiceOf'),
  });
}

function fieldErrorsFrom(error: z.ZodError): ComboItemFormState['fieldErrors'] {
  const out: ComboItemFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === 'variantId' || key === 'quantity') {
      out[key] ??= issue.message;
    }
  }
  return out;
}

/**
 * `choiceOf` restricts which fragrances/variants a customer may pick for this
 * slot — §7: "empty = any in product." Every listed id must belong to the
 * same product as the slot's own variant, or the restriction is meaningless.
 */
async function validateChoiceOf(
  variantId: string,
  choiceOf: string[],
): Promise<string | null> {
  if (choiceOf.length === 0) return null;

  const variant = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) return 'That variant no longer exists.';

  const count = await db.productVariant.count({
    where: { id: { in: choiceOf }, productId: variant.productId },
  });
  if (count !== choiceOf.length) {
    return 'Choice options must be variants of the same product.';
  }
  return null;
}

export async function createComboItemAction(
  comboId: string,
  _previous: ComboItemFormState,
  formData: FormData,
): Promise<ComboItemFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const combo = await db.combo.findUnique({ where: { id: comboId } });
  if (!combo) return { error: 'That combo no longer exists.' };

  const variant = await db.productVariant.findUnique({ where: { id: parsed.data.variantId } });
  if (!variant) {
    return { error: 'Choose a valid variant.', fieldErrors: { variantId: 'No longer exists.' } };
  }

  const choiceOf = parsed.data.isChoice ? parsed.data.choiceOf : [];
  const choiceError = await validateChoiceOf(parsed.data.variantId, choiceOf);
  if (choiceError) {
    return { error: choiceError, fieldErrors: { choiceOf: choiceError } };
  }

  const created = await db.comboItem.create({
    data: {
      comboId,
      variantId: parsed.data.variantId,
      quantity: parsed.data.quantity,
      isChoice: Boolean(parsed.data.isChoice),
      choiceOf,
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'ComboItem',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath(`/admin/combos/${comboId}/items`);
  redirect(`/admin/combos/${comboId}/items`);
}

export async function updateComboItemAction(
  comboId: string,
  itemId: string,
  _previous: ComboItemFormState,
  formData: FormData,
): Promise<ComboItemFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await db.comboItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.comboId !== comboId) {
    return { error: 'That component no longer exists.' };
  }

  const variant = await db.productVariant.findUnique({ where: { id: parsed.data.variantId } });
  if (!variant) {
    return { error: 'Choose a valid variant.', fieldErrors: { variantId: 'No longer exists.' } };
  }

  const choiceOf = parsed.data.isChoice ? parsed.data.choiceOf : [];
  const choiceError = await validateChoiceOf(parsed.data.variantId, choiceOf);
  if (choiceError) {
    return { error: choiceError, fieldErrors: { choiceOf: choiceError } };
  }

  const updated = await db.comboItem.update({
    where: { id: itemId },
    data: {
      variantId: parsed.data.variantId,
      quantity: parsed.data.quantity,
      isChoice: Boolean(parsed.data.isChoice),
      choiceOf,
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'ComboItem',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath(`/admin/combos/${comboId}/items`);
  redirect(`/admin/combos/${comboId}/items`);
}

export async function deleteComboItemAction(comboId: string, itemId: string): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.comboItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.comboId !== comboId) return;

  await db.comboItem.delete({ where: { id: itemId } });

  await recordAudit({
    userId: user.id,
    action: 'deactivate',
    entityType: 'ComboItem',
    entityId: itemId,
    before: existing,
    after: null,
  });

  revalidatePath(`/admin/combos/${comboId}/items`);
}
