'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import {
  MAX_IMPORT_BYTES,
  parseRetailerCsv,
  planRetailerImport,
  retailerKey,
  retailerSchema,
  type RetailerField,
  type RetailerInput,
} from '@/lib/retailer';
import { requireCatalogueAccess } from '@/lib/session';

export interface RetailerFormState {
  error?: string;
  fieldErrors?: Partial<Record<RetailerField, string>>;
  /** Echoed back on failure so a React form reset does not wipe the input. */
  fields?: Partial<Record<RetailerField, string>>;
}

const FIELDS: RetailerField[] = ['name', 'address', 'city', 'district', 'pincode', 'phone'];
const idSchema = z.string().min(1).max(64);

function readForm(formData: FormData) {
  const raw = Object.fromEntries(
    FIELDS.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === 'string' ? value : ''];
    }),
  ) as Record<RetailerField, string>;
  return { raw, parsed: retailerSchema.safeParse(raw) };
}

function invalid(error: z.ZodError, raw: Record<RetailerField, string>): RetailerFormState {
  const fieldErrors: RetailerFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const name = issue.path[0];
    if (typeof name === 'string' && (FIELDS as string[]).includes(name)) {
      fieldErrors[name as RetailerField] ??= issue.message;
    }
  }
  return { error: 'Check the highlighted fields.', fieldErrors, fields: raw };
}

/** Same name at the same pincode is the same shop — see `retailerKey`. */
async function findDuplicate(data: RetailerInput, excludeId?: string) {
  const samePincode = await db.retailer.findMany({
    where: { pincode: data.pincode, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true },
  });
  const key = retailerKey(data.name, data.pincode);
  return samePincode.find((row) => retailerKey(row.name, data.pincode) === key) ?? null;
}

function revalidateRetailers() {
  revalidatePath('/admin/retailers');
  revalidatePath('/stockists');
}

export async function createRetailerAction(
  _previous: RetailerFormState,
  formData: FormData,
): Promise<RetailerFormState> {
  const user = await requireCatalogueAccess();

  const { raw, parsed } = readForm(formData);
  if (!parsed.success) return invalid(parsed.error, raw);

  if (await findDuplicate(parsed.data)) {
    return {
      error: 'A shop with this name is already listed at this pincode. Edit that one instead.',
      fieldErrors: { name: 'Already listed at this pincode.' },
      fields: raw,
    };
  }

  const created = await db.retailer.create({ data: parsed.data });
  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'Retailer',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidateRetailers();
  redirect('/admin/retailers');
}

export async function updateRetailerAction(
  retailerId: string,
  _previous: RetailerFormState,
  formData: FormData,
): Promise<RetailerFormState> {
  const user = await requireCatalogueAccess();

  const id = idSchema.safeParse(retailerId);
  if (!id.success) return { error: 'That retailer no longer exists.' };

  const { raw, parsed } = readForm(formData);
  if (!parsed.success) return invalid(parsed.error, raw);

  const existing = await db.retailer.findUnique({ where: { id: id.data } });
  if (!existing) return { error: 'That retailer no longer exists.' };

  if (await findDuplicate(parsed.data, id.data)) {
    return {
      error: 'Another shop with this name is already listed at this pincode.',
      fieldErrors: { name: 'Already listed at this pincode.' },
      fields: raw,
    };
  }

  const updated = await db.retailer.update({ where: { id: id.data }, data: parsed.data });
  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Retailer',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidateRetailers();
  redirect('/admin/retailers');
}

export async function setRetailerActiveAction(retailerId: string, isActive: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const input = z.object({ id: idSchema, isActive: z.boolean() }).safeParse({ id: retailerId, isActive });
  if (!input.success) return;

  const existing = await db.retailer.findUnique({ where: { id: input.data.id } });
  if (!existing) return;

  const updated = await db.retailer.update({
    where: { id: input.data.id },
    data: { isActive: input.data.isActive },
  });
  await recordAudit({
    userId: user.id,
    action: input.data.isActive ? 'reactivate' : 'deactivate',
    entityType: 'Retailer',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidateRetailers();
}

export interface ImportState {
  errors?: string[];
  summary?: { created: number; updated: number; unchanged: number; duplicatesMerged: number };
}

/**
 * Imports a retailer sheet. All or nothing, twice over: `parseRetailerCsv`
 * refuses the whole file if any row is bad, and the writes and their audit
 * rows commit in one transaction.
 */
export async function importRetailersAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireCatalogueAccess();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { errors: ['Choose a CSV file to upload.'] };
  }
  if (!/\.csv$/i.test(file.name)) {
    return {
      errors: [
        'Only .csv files can be imported. In Excel use Save As, or in Google Sheets use File, Download, and choose CSV. Then upload that file.',
      ],
    };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { errors: ['That file is too large. Split it into files of under 500 KB each.'] };
  }

  const result = parseRetailerCsv(await file.text());
  if (!result.ok) return { errors: result.errors };

  const summary = await db.$transaction(
    async (tx) => {
      const existing = await tx.retailer.findMany({ orderBy: { id: 'asc' } });
      const plan = planRetailerImport(existing, result.rows);

      const created =
        plan.create.length > 0
          ? await tx.retailer.createManyAndReturn({ data: plan.create })
          : [];

      const audits: Prisma.AuditLogCreateManyInput[] = created.map((retailer) => ({
        userId: user.id,
        action: 'create',
        entityType: 'Retailer',
        entityId: retailer.id,
        before: Prisma.JsonNull,
        after: retailer,
      }));

      // Only rows that actually changed reach here, so re-importing the same
      // sheet is zero writes.
      for (const change of plan.update) {
        const after = await tx.retailer.update({
          where: { id: change.id },
          data: { ...change.data, isActive: true },
        });
        audits.push({
          userId: user.id,
          action: change.before.isActive ? 'update' : 'reactivate',
          entityType: 'Retailer',
          entityId: after.id,
          before: { ...change.before },
          after,
        });
      }

      if (audits.length > 0) await tx.auditLog.createMany({ data: audits });

      return {
        created: created.length,
        updated: plan.update.length,
        unchanged: plan.unchanged,
        duplicatesMerged: result.duplicatesMerged,
      };
    },
    // A 2,000-row sheet that changes every shop is 2,000 updates on one
    // connection; the default 5 s would abort it part-way on a remote database.
    { timeout: 60_000, maxWait: 10_000 },
  );

  revalidateRetailers();
  return { summary };
}
