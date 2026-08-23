import { db } from '@/lib/db';
import { flattenTree } from '@/lib/category-tree';
import { requireCatalogueAccess } from '@/lib/session';
import { ProductForm } from '../product-form';
import { createProductAction } from '../actions';

export default async function NewProductPage() {
  await requireCatalogueAccess();

  const [brands, categories] = await Promise.all([
    db.brand.findMany({ orderBy: { name: 'asc' } }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  const brandOptions = brands.map((brand) => ({ id: brand.id, label: brand.name }));
  const categoryOptions = flattenTree(categories).map(({ category, depth }) => ({
    id: category.id,
    label: `${'— '.repeat(depth)}${category.name}`,
  }));

  return (
    <div>
      <h1 className="type-display-sm">New product</h1>
      <ProductForm
        action={createProductAction}
        brandOptions={brandOptions}
        categoryOptions={categoryOptions}
        submitLabel="Create product"
        showVariantRows
      />
    </div>
  );
}
