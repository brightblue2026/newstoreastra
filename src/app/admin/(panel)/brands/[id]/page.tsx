import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { BrandForm, type BrandFormValues } from '../brand-form';
import { updateBrandAction } from '../actions';

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCatalogueAccess();
  const { id } = await params;

  const brand = await db.brand.findUnique({ where: { id } });
  if (!brand) notFound();

  const initialValues: BrandFormValues = {
    name: brand.name,
    slug: brand.slug,
    tagline: brand.tagline ?? '',
    story: brand.story ?? '',
    accentHex: brand.accentHex,
    segment: brand.segment,
    fssaiLicence: brand.fssaiLicence ?? '',
    cosmeticLicence: brand.cosmeticLicence ?? '',
    sortOrder: brand.sortOrder,
  };

  const boundAction = updateBrandAction.bind(null, brand.id);

  return (
    <div>
      <h1 className="type-display-sm">Edit brand</h1>
      <BrandForm action={boundAction} initialValues={initialValues} submitLabel="Save changes" />
    </div>
  );
}
