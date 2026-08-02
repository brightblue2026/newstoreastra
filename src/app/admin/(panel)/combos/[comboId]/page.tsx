import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { paiseToRupeesInput } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { ComboForm, type ComboFormValues } from '../combo-form';
import { updateComboAction } from '../actions';

export default async function EditComboPage({
  params,
}: {
  params: Promise<{ comboId: string }>;
}) {
  await requireCatalogueAccess();
  const { comboId } = await params;

  const combo = await db.combo.findUnique({ where: { id: comboId } });
  if (!combo) notFound();

  const initialValues: ComboFormValues = {
    name: combo.name,
    slug: combo.slug,
    shortDesc: combo.shortDesc,
    description: combo.description,
    imageUrl: combo.imageUrl ?? '',
    priceRupees: paiseToRupeesInput(combo.pricePaise),
    isFeatured: combo.isFeatured,
  };

  const boundAction = updateComboAction.bind(null, combo.id);

  return (
    <div>
      <h1 className="type-display-sm">Edit combo</h1>
      <ComboForm action={boundAction} initialValues={initialValues} submitLabel="Save changes" />
    </div>
  );
}
