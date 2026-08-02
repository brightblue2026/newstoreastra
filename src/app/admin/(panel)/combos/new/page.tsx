import { requireCatalogueAccess } from '@/lib/session';
import { ComboForm } from '../combo-form';
import { createComboAction } from '../actions';

export default async function NewComboPage() {
  await requireCatalogueAccess();

  return (
    <div>
      <h1 className="type-display-sm">New combo</h1>
      <ComboForm action={createComboAction} submitLabel="Create combo" />
    </div>
  );
}
