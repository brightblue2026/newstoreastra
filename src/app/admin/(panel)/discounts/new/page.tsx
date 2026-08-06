import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { DiscountForm } from '../discount-form';
import { createDiscountAction, previewDiscountAction } from '../actions';

export default async function NewDiscountPage() {
  await requireCatalogueAccess();

  const [brands, categories, products, combos, variants] = await Promise.all([
    db.brand.findMany({ orderBy: { name: 'asc' } }),
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.product.findMany({ orderBy: { name: 'asc' } }),
    db.combo.findMany({ orderBy: { name: 'asc' } }),
    db.productVariant.findMany({
      include: { product: true },
      orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
    }),
  ]);

  return (
    <div>
      <h1 className="type-display-sm">New discount</h1>
      <DiscountForm
        action={createDiscountAction}
        previewAction={previewDiscountAction}
        brandOptions={brands.map((b) => ({ id: b.id, label: b.name }))}
        categoryOptions={categories.map((c) => ({ id: c.id, label: c.name }))}
        productOptions={products.map((p) => ({ id: p.id, label: p.name }))}
        comboOptions={combos.map((c) => ({ id: c.id, label: c.name }))}
        variantOptions={variants.map((v) => ({
          id: v.id,
          label: `${v.product.name}${v.variantName ? ` — ${v.variantName}` : ''} (${v.sku})`,
        }))}
        submitLabel="Create discount"
      />
    </div>
  );
}
