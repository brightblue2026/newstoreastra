import Link from 'next/link';
import { db } from '@/lib/db';
import { flattenTree } from '@/lib/category-tree';
import { requireCatalogueAccess } from '@/lib/session';
import { createProductAction } from '../actions';
import { GuidedProductForm } from './guided-form';

/**
 * The guided route. Same guard, same action, same data as `../new` — a
 * different set of questions over them. See `guided-form.tsx`.
 */
export default async function QuickAddProductPage() {
  await requireCatalogueAccess();

  const [brands, categories] = await Promise.all([
    db.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const brandOptions = brands.map((brand) => ({
    id: brand.id,
    label: brand.name,
    segment: brand.segment,
    // Whichever licence this brand's segment calls for — the form warns when it
    // is missing, because the product cannot lawfully go live without it.
    hasLicence:
      brand.segment === 'FOOD' || brand.segment === 'BEVERAGE'
        ? Boolean(brand.fssaiLicence)
        : brand.segment === 'PERSONAL_CARE'
          ? Boolean(brand.cosmeticLicence)
          : true,
  }));

  const categoryOptions = flattenTree(categories).map(({ category, depth }) => ({
    id: category.id,
    label: `${'— '.repeat(depth)}${category.name}`,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-display-sm">Add a product</h1>
        <Link href="/admin/products/new" className="type-body text-signal">
          Use the full form instead
        </Link>
      </div>
      <p className="mt-4 max-w-2xl type-body-lg text-ink-soft">
        Five short steps. Nothing goes live until you publish it.
      </p>

      <GuidedProductForm
        action={createProductAction}
        brandOptions={brandOptions}
        categoryOptions={categoryOptions}
      />
    </div>
  );
}
