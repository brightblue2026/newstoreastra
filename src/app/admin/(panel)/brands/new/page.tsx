import { requireCatalogueAccess } from '@/lib/session';
import { BrandForm } from '../brand-form';
import { createBrandAction } from '../actions';

export default async function NewBrandPage() {
  await requireCatalogueAccess();

  return (
    <div>
      <h1 className="type-display-sm">New brand</h1>
      <BrandForm action={createBrandAction} submitLabel="Create brand" />
    </div>
  );
}
