import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { ComboItemForm } from '../item-form';
import { createComboItemAction } from '../actions';

export default async function NewComboItemPage({
  params,
}: {
  params: Promise<{ comboId: string }>;
}) {
  await requireCatalogueAccess();
  const { comboId } = await params;

  const combo = await db.combo.findUnique({ where: { id: comboId } });
  if (!combo) notFound();

  const variants = await db.productVariant.findMany({
    include: { product: true },
    orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
  });

  const variantOptions = variants.map((variant) => ({
    id: variant.id,
    productId: variant.productId,
    label: `${variant.product.name}${variant.variantName ? ` — ${variant.variantName}` : ''} (${variant.sku})`,
  }));

  const boundAction = createComboItemAction.bind(null, comboId);

  return (
    <div>
      <p className="type-caption text-ink-soft">{combo.name}</p>
      <h1 className="type-display-sm">Add component</h1>
      <ComboItemForm
        action={boundAction}
        variantOptions={variantOptions}
        submitLabel="Add component"
      />
    </div>
  );
}
