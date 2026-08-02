import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { CategoryForm, type CategoryFormValues } from '../category-form';
import { updateCategoryAction } from '../actions';
import { descendantIds, flattenTree } from '@/lib/category-tree';

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCatalogueAccess();
  const { id } = await params;

  const category = await db.category.findUnique({ where: { id } });
  if (!category) notFound();

  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } });
  const excluded = descendantIds(categories, id);
  const parentOptions = flattenTree(categories)
    .filter(({ category: c }) => !excluded.has(c.id))
    .map(({ category: c, depth }) => ({
      id: c.id,
      label: `${'— '.repeat(depth)}${c.name}`,
    }));

  const initialValues: CategoryFormValues = {
    name: category.name,
    slug: category.slug,
    parentId: category.parentId ?? '',
    description: category.description ?? '',
    sortOrder: category.sortOrder,
  };

  const boundAction = updateCategoryAction.bind(null, category.id);

  return (
    <div>
      <h1 className="type-display-sm">Edit category</h1>
      <CategoryForm
        action={boundAction}
        initialValues={initialValues}
        parentOptions={parentOptions}
        submitLabel="Save changes"
      />
    </div>
  );
}
