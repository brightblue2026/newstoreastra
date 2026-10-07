import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { setRetailerActiveAction } from './actions';

const LIST_LIMIT = 500;

export default async function RetailersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; district?: string }>;
}) {
  await requireCatalogueAccess();

  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 100);
  const district = (params.district ?? '').trim().slice(0, 80);

  const where: Prisma.RetailerWhereInput = {
    ...(district ? { district } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
            { pincode: { startsWith: query } },
          ],
        }
      : {}),
  };

  const [retailers, matching, everything, districts] = await Promise.all([
    db.retailer.findMany({
      where,
      orderBy: [{ district: 'asc' }, { city: 'asc' }, { name: 'asc' }],
      take: LIST_LIMIT,
    }),
    db.retailer.count({ where }),
    db.retailer.count(),
    db.retailer.findMany({
      distinct: ['district'],
      select: { district: true },
      orderBy: { district: 'asc' },
    }),
  ]);

  const filtered = Boolean(query || district);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-display-sm">Retailers</h1>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/retailers/import"
            className="rounded-control border border-ink px-6 py-3 type-body font-medium"
          >
            Import CSV
          </Link>
          <Link
            href="/admin/retailers/new"
            className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
          >
            New retailer
          </Link>
        </div>
      </div>
      <p className="mt-4 max-w-2xl type-body text-ink-soft">
        Active retailers are listed on the{' '}
        <Link href="/stockists" className="underline" target="_blank">
          Stockists
        </Link>{' '}
        page, where customers search by pincode or district.
      </p>

      {everything === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          No retailers yet. Add one, or import the distributor sheet as a CSV.
        </p>
      ) : (
        <>
          <form className="mt-8 flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="block type-caption text-ink-soft">Name, town or pincode</span>
              <input
                name="q"
                defaultValue={query}
                className="mt-2 rounded-control border border-line bg-paper px-4 py-2 type-body"
              />
            </label>
            <label className="block">
              <span className="block type-caption text-ink-soft">District</span>
              <select
                name="district"
                defaultValue={district}
                className="mt-2 rounded-control border border-line bg-paper px-4 py-2 type-body"
              >
                <option value="">Any</option>
                {districts.map((row) => (
                  <option key={row.district} value={row.district}>
                    {row.district}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-control border border-ink px-4 py-2 type-body">
              Filter
            </button>
            {filtered && (
              <Link href="/admin/retailers" className="type-caption underline">
                Clear
              </Link>
            )}
          </form>

          <p className="mt-6 type-caption normal-case text-ink-soft">
            {matching === everything
              ? `${everything} ${everything === 1 ? 'retailer' : 'retailers'}`
              : `${matching} of ${everything} retailers match`}
            {matching > LIST_LIMIT && ` · showing the first ${LIST_LIMIT}; narrow the filter to see the rest`}
          </p>

          {retailers.length === 0 ? (
            <p className="mt-8 type-body text-ink-soft">No retailers match that filter.</p>
          ) : (
            // `relative`, so the visually hidden column heading (absolutely
            // positioned) is clipped by this scroller instead of widening the
            // whole page on a phone.
            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-3xl border-collapse">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="py-3 type-caption font-normal text-ink-soft">Shop</th>
                    <th scope="col" className="py-3 type-caption font-normal text-ink-soft">Place</th>
                    <th scope="col" className="py-3 type-caption font-normal text-ink-soft">Pincode</th>
                    <th scope="col" className="py-3 type-caption font-normal text-ink-soft">Phone</th>
                    <th scope="col" className="py-3 type-caption font-normal text-ink-soft">Status</th>
                    <th scope="col" className="py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {retailers.map((retailer) => (
                    <tr key={retailer.id} className="border-b border-line align-top">
                      <td className="py-3 type-body">{retailer.name}</td>
                      <td className="py-3 type-body text-ink-soft">
                        {retailer.city}
                        <span className="block type-caption normal-case">{retailer.district}</span>
                      </td>
                      <td className="py-3 type-mono text-ink-soft">{retailer.pincode}</td>
                      <td className="py-3 type-body text-ink-soft">{retailer.phone ?? '—'}</td>
                      <td className="py-3 type-body">{retailer.isActive ? 'Listed' : 'Hidden'}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-4">
                          <Link href={`/admin/retailers/${retailer.id}`} className="type-body text-signal">
                            Edit
                          </Link>
                          <form action={setRetailerActiveAction.bind(null, retailer.id, !retailer.isActive)}>
                            <button type="submit" className="type-body text-ink-soft underline">
                              {retailer.isActive ? 'Hide' : 'List'}
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
        </>
      )}
    </div>
  );
}
