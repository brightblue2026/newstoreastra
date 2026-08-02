'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';

export interface CategoryFormState {
  error?: string;
  fieldErrors?: Partial<Record<'name' | 'slug' | 'parentId', string>>;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, 'Slug must be lowercase letters, numbers and hyphens only.'),
  parentId: z.string().trim().optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

function parseCategoryForm(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    parentId: formData.get('parentId'),
    description: formData.get('description'),
    sortOrder: formData.get('sortOrder'),
  });
}

function fieldErrorsFrom(error: z.ZodError): CategoryFormState['fieldErrors'] {
  const out: CategoryFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === 'name' || key === 'slug' || key === 'parentId') {
      out[key] ??= issue.message;
    }
  }
  return out;
}

/** Every id in `categoryId`'s subtree, including itself. Used to block a move that would create a cycle. */
async function subtreeIds(categoryId: string): Promise<Set<string>> {
  const ids = new Set<string>([categoryId]);
  let frontier = [categoryId];

  while (frontier.length > 0) {
    const children = await db.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id).filter((id) => !ids.has(id));
    for (const id of frontier) ids.add(id);
  }

  return ids;
}

export async function createCategoryAction(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseCategoryForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const parentId = parsed.data.parentId || null;
  if (parentId) {
    const parent = await db.category.findUnique({ where: { id: parentId } });
    if (!parent) {
      return {
        error: 'Choose a valid parent category.',
        fieldErrors: { parentId: 'That parent no longer exists.' },
      };
    }
  }

  const data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    parentId,
    description: parsed.data.description || null,
    sortOrder: parsed.data.sortOrder,
  };

  let created;
  try {
    created = await db.category.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'Category',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath('/admin/categories');
  redirect('/admin/categories');
}

export async function updateCategoryAction(
  categoryId: string,
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseCategoryForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await db.category.findUnique({ where: { id: categoryId } });
  if (!existing) {
    return { error: 'That category no longer exists.' };
  }

  const parentId = parsed.data.parentId || null;
  if (parentId) {
    if (parentId === categoryId) {
      return {
        error: 'A category cannot be its own parent.',
        fieldErrors: { parentId: 'Choose a different parent.' },
      };
    }
    const parent = await db.category.findUnique({ where: { id: parentId } });
    if (!parent) {
      return {
        error: 'Choose a valid parent category.',
        fieldErrors: { parentId: 'That parent no longer exists.' },
      };
    }
    const descendants = await subtreeIds(categoryId);
    if (descendants.has(parentId)) {
      return {
        error: 'That would move this category inside its own subtree.',
        fieldErrors: { parentId: 'Choose a category outside this branch.' },
      };
    }
  }

  const data = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    parentId,
    description: parsed.data.description || null,
    sortOrder: parsed.data.sortOrder,
  };

  let updated;
  try {
    updated = await db.category.update({ where: { id: categoryId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Category',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/categories');
  redirect('/admin/categories');
}

export async function setCategoryActiveAction(
  categoryId: string,
  isActive: boolean,
): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.category.findUnique({ where: { id: categoryId } });
  if (!existing) return;

  const updated = await db.category.update({ where: { id: categoryId }, data: { isActive } });

  await recordAudit({
    userId: user.id,
    action: isActive ? 'reactivate' : 'deactivate',
    entityType: 'Category',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/categories');
}
