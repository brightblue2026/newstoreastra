import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { paiseToRupeesInput } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { VariantForm, type VariantFormValues } from '../variant-form';
import { updateVariantAction } from '../actions';

export default async function EditVariantPage({
  params,
}: {
  params: Promise<{ productId: string; variantId: string }>;
}) {
  await requireCatalogueAccess();
  const { productId, variantId } = await params;

  const [product, variant] = await Promise.all([
    db.product.findUnique({ where: { id: productId } }),
    db.productVariant.findUnique({ where: { id: variantId } }),
  ]);
  if (!product || !variant || variant.productId !== productId) notFound();

  const initialValues: VariantFormValues = {
    sku: variant.sku,
    variantName: variant.variantName ?? '',
    variantHex: variant.variantHex ?? '',
    size: variant.size,
    format: variant.format ?? '',
    mrpRupees: variant.mrpPaise === null ? '' : paiseToRupeesInput(variant.mrpPaise),
    priceRupees: variant.pricePaise === null ? '' : paiseToRupeesInput(variant.pricePaise),
    wholesaleRupees:
      variant.wholesalePaise === null ? '' : paiseToRupeesInput(variant.wholesalePaise),
    weightGrams: variant.weightGrams === null ? '' : String(variant.weightGrams),
    barcode: variant.barcode ?? '',
  };

  const boundAction = updateVariantAction.bind(null, productId, variantId);

  return (
    <div>
      <p className="type-caption text-ink-soft">{product.name}</p>
      <h1 className="type-display-sm">Edit variant</h1>
      <VariantForm action={boundAction} initialValues={initialValues} submitLabel="Save changes" />
    </div>
  );
}
