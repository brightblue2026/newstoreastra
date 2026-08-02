import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { CategoryForm, type CategoryFormValues } from '../category-form';
import { createCategoryAction } from '../actions';
import { flattenTree } from '@/lib/category-tree';

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  await requireCatalogueAccess();
  const { parent } = await searchParams;

  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } });
  const parentOptions = flattenTree(categories).map(({ category, depth }) => ({
    id: category.id,
    label: `${'— '.repeat(depth)}${category.name}`,
  }));

  const initialValues: CategoryFormValues | undefined = parent
    ? { name: '', slug: '', parentId: parent, description: '', sortOrder: 0 }
    : undefined;

  return (
    <div>
      <h1 className="type-display-sm">New category</h1>
      <CategoryForm
        action={createCategoryAction}
        initialValues={initialValues}
        parentOptions={parentOptions}
        submitLabel="Create category"
      />
    </div>
  );
}
