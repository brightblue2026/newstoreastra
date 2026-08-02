import Link from 'next/link';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { setComboActiveAction } from './actions';

export default async function CombosPage() {
  await requireCatalogueAccess();

  const combos = await db.combo.findMany({
    orderBy: { name: 'asc' },
    include: { items: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="type-display-sm">Combos</h1>
        <Link
          href="/admin/combos/new"
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
        >
          New combo
        </Link>
      </div>

      {combos.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">No combos yet. Create the first one.</p>
      ) : (
        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-3 type-caption text-ink-soft">Name</th>
              <th className="py-3 type-caption text-ink-soft">Price</th>
              <th className="py-3 type-caption text-ink-soft">Components</th>
              <th className="py-3 type-caption text-ink-soft">Status</th>
              <th className="py-3 type-caption text-ink-soft" />
            </tr>
          </thead>
          <tbody>
            {combos.map((combo) => (
              <tr key={combo.id} className="border-b border-line">
                <td className="py-3 type-body">{combo.name}</td>
                <td className="py-3 type-mono" data-price>
                  {formatINR(combo.pricePaise)}
                </td>
                <td className="py-3 type-body text-ink-soft">{combo.items.length}</td>
                <td className="py-3 type-body">{combo.isActive ? 'Published' : 'Draft'}</td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-4">
                    <Link
                      href={`/admin/combos/${combo.id}/items`}
                      className="type-body text-signal"
                    >
                      Components
                    </Link>
                    <Link href={`/admin/combos/${combo.id}`} className="type-body text-signal">
                      Edit
                    </Link>
                    <form action={setComboActiveAction.bind(null, combo.id, !combo.isActive)}>
                      <button type="submit" className="type-body text-ink-soft underline">
                        {combo.isActive ? 'Unpublish' : 'Publish'}
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
