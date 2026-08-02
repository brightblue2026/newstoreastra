'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { Segment } from '@/generated/prisma/enums';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';

export interface BrandFormState {
  error?: string;
  fieldErrors?: Partial<Record<'name' | 'slug' | 'accentHex' | 'segment', string>>;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const brandSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, 'Slug must be lowercase letters, numbers and hyphens only.'),
  tagline: z.string().trim().max(200).optional().or(z.literal('')),
  story: z.string().trim().max(5000).optional().or(z.literal('')),
  accentHex: z
    .string()
    .trim()
    .regex(HEX_COLOUR_PATTERN, 'Enter a 6-digit hex colour, e.g. #0F9CD6.'),
  segment: z.enum(Object.values(Segment) as [Segment, ...Segment[]], {
    message: 'Choose a segment.',
  }),
  fssaiLicence: z.string().trim().max(60).optional().or(z.literal('')),
  cosmeticLicence: z.string().trim().max(60).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

/**
 * Every field arrives as an untyped string from `FormData` — nothing here is
 * trusted until `safeParse` has run, regardless of what the form's `type` or
 * `pattern` attributes claim client-side.
 */
function parseBrandForm(formData: FormData) {
  return brandSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    tagline: formData.get('tagline'),
    story: formData.get('story'),
    accentHex: formData.get('accentHex'),
    segment: formData.get('segment'),
    fssaiLicence: formData.get('fssaiLicence'),
    cosmeticLicence: formData.get('cosmeticLicence'),
    sortOrder: formData.get('sortOrder'),
  });
}

function fieldErrorsFrom(error: z.ZodError): BrandFormState['fieldErrors'] {
  const out: BrandFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === 'name' || key === 'slug' || key === 'accentHex' || key === 'segment') {
      out[key] ??= issue.message;
    }
  }
  return out;
}

export async function createBrandAction(
  _previous: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseBrandForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const data = {
    ...parsed.data,
    tagline: parsed.data.tagline || null,
    story: parsed.data.story || null,
    fssaiLicence: parsed.data.fssaiLicence || null,
    cosmeticLicence: parsed.data.cosmeticLicence || null,
  };

  let created;
  try {
    created = await db.brand.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'create',
    entityType: 'Brand',
    entityId: created.id,
    before: null,
    after: created,
  });

  revalidatePath('/admin/brands');
  redirect('/admin/brands');
}

export async function updateBrandAction(
  brandId: string,
  _previous: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const user = await requireCatalogueAccess();

  const parsed = parseBrandForm(formData);
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await db.brand.findUnique({ where: { id: brandId } });
  if (!existing) {
    return { error: 'That brand no longer exists.' };
  }

  const data = {
    ...parsed.data,
    tagline: parsed.data.tagline || null,
    story: parsed.data.story || null,
    fssaiLicence: parsed.data.fssaiLicence || null,
    cosmeticLicence: parsed.data.cosmeticLicence || null,
  };

  let updated;
  try {
    updated = await db.brand.update({ where: { id: brandId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That slug is already in use.', fieldErrors: { slug: 'Already taken.' } };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Brand',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/brands');
  redirect('/admin/brands');
}

export async function setBrandActiveAction(brandId: string, isActive: boolean): Promise<void> {
  const user = await requireCatalogueAccess();

  const existing = await db.brand.findUnique({ where: { id: brandId } });
  if (!existing) return;

  const updated = await db.brand.update({ where: { id: brandId }, data: { isActive } });

  await recordAudit({
    userId: user.id,
    action: isActive ? 'reactivate' : 'deactivate',
    entityType: 'Brand',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  revalidatePath('/admin/brands');
}
