import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { flattenTree } from '@/lib/category-tree';
import { requireCatalogueAccess } from '@/lib/session';
import { ProductForm, type ProductFormValues } from '../product-form';
import { updateProductAction } from '../actions';
import { formatClaims, formatSteps, readFoodLabel } from '../format';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await requireCatalogueAccess();
  const { productId } = await params;

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) notFound();

  const [brands, categories] = await Promise.all([
    db.brand.findMany({ orderBy: { name: 'asc' } }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  const brandOptions = brands.map((brand) => ({ id: brand.id, label: brand.name }));
  const categoryOptions = flattenTree(categories).map(({ category, depth }) => ({
    id: category.id,
    label: `${'— '.repeat(depth)}${category.name}`,
  }));

  const foodLabel = readFoodLabel(product.foodLabel);

  const initialValues: ProductFormValues = {
    name: product.name,
    slug: product.slug,
    brandId: product.brandId,
    categoryId: product.categoryId,
    shortDesc: product.shortDesc,
    description: product.description,
    hsnCode: product.hsnCode ?? '',
    gstRatePercent: product.gstRate === null ? '' : String(product.gstRate / 100),
    claims: formatClaims(product.claims),
    ingredients: product.ingredients ?? '',
    usageSteps: formatSteps(product.usageSteps),
    isFoodProduct: product.isFoodProduct,
    isCosmetic: product.isCosmetic,
    netQty: foodLabel.netQty,
    batch: foodLabel.batch,
    mfgDate: foodLabel.mfgDate,
    bestBefore: foodLabel.bestBefore,
    vegMark: foodLabel.vegMark,
    nutrition: foodLabel.nutrition,
    allergens: foodLabel.allergens,
    countryOfOrigin: product.countryOfOrigin ?? '',
    manufacturerName: product.manufacturerName ?? '',
    manufacturerAddress: product.manufacturerAddress ?? '',
    shelfLife: product.shelfLife ?? '',
    safetyWarnings: product.safetyWarnings ?? '',
    isFeatured: product.isFeatured,
    sortOrder: product.sortOrder,
    metaTitle: product.metaTitle ?? '',
    metaDesc: product.metaDesc ?? '',
  };

  const boundAction = updateProductAction.bind(null, product.id);

  return (
    <div>
      <h1 className="type-display-sm">Edit product</h1>
      <ProductForm
        action={boundAction}
        initialValues={initialValues}
        brandOptions={brandOptions}
        categoryOptions={categoryOptions}
        submitLabel="Save changes"
      />
    </div>
  );
}
