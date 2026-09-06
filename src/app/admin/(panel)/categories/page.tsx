import Link from 'next/link';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { flattenTree } from '@/lib/category-tree';
import { setCategoryActiveAction } from './actions';

export default async function CategoriesPage() {
  await requireCatalogueAccess();

  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } });
  const rows = flattenTree(categories);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="type-display-sm">Categories</h1>
        <Link
          href="/admin/categories/new"
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
        >
          New category
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">No categories yet. Create the first one.</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-3 type-caption text-ink-soft">Name</th>
                <th className="py-3 type-caption text-ink-soft">Slug</th>
                <th className="py-3 type-caption text-ink-soft">Status</th>
                <th className="py-3 type-caption text-ink-soft" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ category, depth }) => (
                <tr key={category.id} className="border-b border-line">
                  <td className="py-3 type-body">
                    <span style={{ paddingLeft: `${depth * 20}px` }}>
                      {depth > 0 && <span className="text-ink-soft">— </span>}
                      {category.name}
                    </span>
                  </td>
                  <td className="py-3 type-mono text-ink-soft">{category.slug}</td>
                  <td className="py-3 type-body">{category.isActive ? 'Active' : 'Inactive'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-4">
                      <Link
                        href={`/admin/categories/new?parent=${category.id}`}
                        className="type-body text-signal"
                      >
                        Add sub
                      </Link>
                      <Link
                        href={`/admin/categories/${category.id}`}
                        className="type-body text-signal"
                      >
                        Edit
                      </Link>
                      <form
                        action={setCategoryActiveAction.bind(null, category.id, !category.isActive)}
                      >
                        <button type="submit" className="type-body text-ink-soft underline">
                          {category.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
