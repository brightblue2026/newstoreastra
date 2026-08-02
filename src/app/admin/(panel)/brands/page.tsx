import Link from 'next/link';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { setBrandActiveAction } from './actions';

export default async function BrandsPage() {
  await requireCatalogueAccess();

  const brands = await db.brand.findMany({ orderBy: { sortOrder: 'asc' } });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="type-display-sm">Brands</h1>
        <Link
          href="/admin/brands/new"
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
        >
          New brand
        </Link>
      </div>

      {brands.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">No brands yet. Create the first one.</p>
      ) : (
        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-3 type-caption text-ink-soft">Name</th>
              <th className="py-3 type-caption text-ink-soft">Segment</th>
              <th className="py-3 type-caption text-ink-soft">Slug</th>
              <th className="py-3 type-caption text-ink-soft">Status</th>
              <th className="py-3 type-caption text-ink-soft" />
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} className="border-b border-line">
                <td className="py-3 type-body">
                  <span
                    aria-hidden
                    className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                    style={{ backgroundColor: brand.accentHex }}
                  />
                  {brand.name}
                </td>
                <td className="py-3 type-body text-ink-soft">{brand.segment}</td>
                <td className="py-3 type-mono text-ink-soft">{brand.slug}</td>
                <td className="py-3 type-body">
                  {brand.isActive ? 'Active' : 'Inactive'}
                </td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-4">
                    <Link href={`/admin/brands/${brand.id}`} className="type-body text-signal">
                      Edit
                    </Link>
                    <form action={setBrandActiveAction.bind(null, brand.id, !brand.isActive)}>
                      <button type="submit" className="type-body text-ink-soft underline">
                        {brand.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
