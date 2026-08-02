import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { ComboItemForm, type ComboItemFormValues } from '../item-form';
import { updateComboItemAction } from '../actions';

export default async function EditComboItemPage({
  params,
}: {
  params: Promise<{ comboId: string; itemId: string }>;
}) {
  await requireCatalogueAccess();
  const { comboId, itemId } = await params;

  const [combo, item] = await Promise.all([
    db.combo.findUnique({ where: { id: comboId } }),
    db.comboItem.findUnique({ where: { id: itemId } }),
  ]);
  if (!combo || !item || item.comboId !== comboId) notFound();

  const variants = await db.productVariant.findMany({
    include: { product: true },
    orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
  });

  const variantOptions = variants.map((variant) => ({
    id: variant.id,
    productId: variant.productId,
    label: `${variant.product.name}${variant.variantName ? ` — ${variant.variantName}` : ''} (${variant.sku})`,
  }));

  const initialValues: ComboItemFormValues = {
    variantId: item.variantId,
    quantity: item.quantity,
    isChoice: item.isChoice,
    choiceOf: item.choiceOf,
  };

  const boundAction = updateComboItemAction.bind(null, comboId, itemId);

  return (
    <div>
      <p className="type-caption text-ink-soft">{combo.name}</p>
      <h1 className="type-display-sm">Edit component</h1>
      <ComboItemForm
        action={boundAction}
        initialValues={initialValues}
        variantOptions={variantOptions}
        submitLabel="Save changes"
      />
    </div>
  );
}
