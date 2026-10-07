'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { StockInputError, parseQuantity } from './stock';

export interface StockFormState {
  error?: string;
  /** Keyed by location id, so an error lands on the row that caused it. */
  fieldErrors?: Record<string, string>;
  /** Set on success, for the confirmation line. */
  saved?: string;
}

const idSchema = z.string().trim().min(1).max(64);

/**
 * Sets counted stock for one variant, across every active location, in one
 * submit.
 *
 * `reserved` is deliberately not settable — see the note at the top of
 * `stock.ts`. It belongs to the order engine, and a hand-edited value would be
 * both a way to oversell and wrong again within seconds.
 */
export async function setStockAction(
  variantId: string,
  _previous: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  const user = await requireCatalogueAccess();

  const parsedId = idSchema.safeParse(variantId);
  if (!parsedId.success) return { error: 'That variant no longer exists.' };

  const variant = await db.productVariant.findUnique({
    where: { id: parsedId.data },
    include: { product: true },
  });
  if (!variant) return { error: 'That variant no longer exists.' };

  const locations = await db.location.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  // Read and validate everything before writing anything: a typo in the ninth
  // location must not leave the first eight already saved and the page showing
  // an error, which is how a half-applied stocktake happens.
  const fieldErrors: Record<string, string> = {};
  const intents: { locationId: string; quantity: number; lowStockAt: number }[] = [];

  for (const location of locations) {
    const rawQuantity = formData.get(`qty_${location.id}`);
    const rawLow = formData.get(`low_${location.id}`);

    // A location the form never rendered is simply left alone, not zeroed.
    if (typeof rawQuantity !== 'string' && typeof rawLow !== 'string') continue;

    try {
      intents.push({
        locationId: location.id,
        quantity: parseQuantity(typeof rawQuantity === 'string' ? rawQuantity : '', 'Stock'),
        lowStockAt: parseQuantity(
          typeof rawLow === 'string' && rawLow.trim() !== '' ? rawLow : '10',
          'Low stock alert',
        ),
      });
    } catch (error) {
      if (error instanceof StockInputError) {
        fieldErrors[location.id] = error.message;
        continue;
      }
      throw error;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Check the highlighted rows.', fieldErrors };
  }
  if (intents.length === 0) {
    return { error: 'There are no active locations to stock this in.' };
  }

  const existing = await db.inventory.findMany({ where: { variantId: variant.id } });
  const byLocation = new Map(existing.map((row) => [row.locationId, row]));

  // Only rows whose numbers actually moved are written, so an unchanged
  // stocktake writes nothing and leaves no audit noise behind.
  const changes = intents.filter((intent) => {
    const before = byLocation.get(intent.locationId);
    if (!before) return true;
    return before.quantity !== intent.quantity || before.lowStockAt !== intent.lowStockAt;
  });

  if (changes.length === 0) {
    return { saved: 'Nothing to save — those numbers are already what is recorded.' };
  }

  await db.$transaction(async (tx) => {
    for (const change of changes) {
      const before = byLocation.get(change.locationId) ?? null;

      const after = await tx.inventory.upsert({
        where: {
          variantId_locationId: { variantId: variant.id, locationId: change.locationId },
        },
        // `reserved` is absent from both branches on purpose: on create it
        // takes the schema default of 0, and on update it is left exactly as
        // the order engine last set it.
        create: {
          variantId: variant.id,
          locationId: change.locationId,
          quantity: change.quantity,
          lowStockAt: change.lowStockAt,
        },
        update: { quantity: change.quantity, lowStockAt: change.lowStockAt },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: before ? 'update' : 'create',
          entityType: 'Inventory',
          entityId: after.id,
          before: before ? (before as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          after: after as unknown as Prisma.InputJsonValue,
        },
      });
    }
  });

  revalidatePath('/admin/inventory');
  revalidatePath(`/admin/inventory/${variant.id}`);
  // The storefront reads availability to decide what can be bought.
  revalidatePath(`/products/${variant.product.slug}`);

  const count = changes.length;
  return { saved: `Saved. ${count} location${count === 1 ? '' : 's'} updated.` };
}
