'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
import { recordAudit } from '@/lib/audit';
import {
  contentFromForm,
  describeIssues,
  editorKeySchema,
  policySlugOf,
  schemaForEditorKey,
} from '@/lib/content-schema';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';

export interface ContentFormState {
  error?: string;
  issues?: string[];
  saved?: string;
  /**
   * What was submitted, echoed back on a failed save. React resets a form
   * after its action runs; without this the editor would lose every word they
   * typed to one validation error.
   */
  fields?: Record<string, string>;
}

function submittedFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    // Next adds its own `$ACTION_…` entries to every action submission.
    if (typeof value === 'string' && !name.startsWith('$')) fields[name] = value;
  }
  return fields;
}

/** Content is MANAGER-editable per §6, alongside the catalogue. */
export async function saveContentAction(
  rawKey: string,
  _previous: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const user = await requireCatalogueAccess();

  const key = editorKeySchema.safeParse(rawKey);
  if (!key.success) return { error: 'That content block does not exist.' };

  const parsed = schemaForEditorKey(key.data).safeParse(contentFromForm(key.data, formData));
  if (!parsed.success) {
    return {
      error: 'Nothing was saved. Fix the following, then save again.',
      issues: describeIssues(parsed.error.issues),
      fields: submittedFields(formData),
    };
  }

  const data = parsed.data as Prisma.InputJsonValue;

  await db.$transaction(async (tx) => {
    const existing = await tx.contentBlock.findUnique({ where: { key: key.data } });
    const saved = await tx.contentBlock.upsert({
      where: { key: key.data },
      create: { key: key.data, data },
      update: { data, isActive: true },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: existing ? 'update' : 'create',
        entityType: 'ContentBlock',
        entityId: saved.id,
        before: existing ?? Prisma.JsonNull,
        after: saved,
      },
    });
  });

  // The announcement bar and the footer's policy links sit in the storefront
  // layout, so every page is affected, not only the one a block is named for.
  revalidatePath('/', 'layout');

  return {
    saved: policySlugOf(key.data)
      ? 'Published. The page is live now.'
      : 'Saved. The storefront now shows this version.',
  };
}

/**
 * Puts a homepage block back to its original wording, or unpublishes a
 * policy. The row is deactivated, not deleted: the text stays in the audit
 * log, and a policy's draft stays in the editor to publish again.
 */
export async function revertContentAction(rawKey: string): Promise<void> {
  const user = await requireCatalogueAccess();

  const key = editorKeySchema.safeParse(rawKey);
  if (!key.success) return;

  const existing = await db.contentBlock.findUnique({ where: { key: key.data } });
  if (!existing || !existing.isActive) return;

  const updated = await db.contentBlock.update({
    where: { key: key.data },
    data: { isActive: false },
  });

  await recordAudit({
    userId: user.id,
    action: 'deactivate',
    entityType: 'ContentBlock',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/', 'layout');
}
