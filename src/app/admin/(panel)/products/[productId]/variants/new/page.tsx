import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { VariantForm } from '../variant-form';
import { createVariantAction } from '../actions';

export default async function NewVariantPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await requireCatalogueAccess();
  const { productId } = await params;

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) notFound();

  const boundAction = createVariantAction.bind(null, productId);

  return (
    <div>
      <p className="type-caption text-ink-soft">{product.name}</p>
      <h1 className="type-display-sm">New variant</h1>
      <VariantForm action={boundAction} submitLabel="Create variant" />
    </div>
  );
}
