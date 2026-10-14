import Link from '@/components/Link';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { setDiscountActiveAction } from './actions';

function describeValue(discount: {
  type: string;
  valueBps: number | null;
  valuePaise: number | null;
  buyQty: number | null;
  getQty: number | null;
}): string {
  switch (discount.type) {
    case 'PERCENTAGE':
      return discount.valueBps ? `${discount.valueBps / 100}% off` : '—';
    case 'FIXED_AMOUNT':
      return discount.valuePaise ? `${formatINR(discount.valuePaise)} off` : '—';
    case 'BUY_X_GET_Y':
      return `Buy ${discount.buyQty} get ${discount.getQty}`;
    case 'FREE_SHIPPING':
      return 'Free shipping';
    case 'TIERED_QUANTITY':
      return 'Tiered';
    default:
      return '—';
  }
}

export default async function DiscountsPage() {
  await requireCatalogueAccess();

  const discounts = await db.discount.findMany({
    orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }],
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="type-display-sm">Discounts</h1>
        <Link
          href="/admin/discounts/new"
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
        >
          New discount
        </Link>
      </div>

      {discounts.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">No discounts yet. Create the first one.</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-3 type-caption text-ink-soft">Name</th>
                <th className="py-3 type-caption text-ink-soft">Code</th>
                <th className="py-3 type-caption text-ink-soft">Value</th>
                <th className="py-3 type-caption text-ink-soft">Scope</th>
                <th className="py-3 type-caption text-ink-soft">Status</th>
                <th className="py-3 type-caption text-ink-soft" />
              </tr>
            </thead>
            <tbody>
              {discounts.map((discount) => (
                <tr key={discount.id} className="border-b border-line">
                  <td className="py-3 type-body">{discount.name}</td>
                  <td className="py-3 type-mono text-ink-soft">{discount.code ?? 'Automatic'}</td>
                  <td className="py-3 type-body text-ink-soft">{describeValue(discount)}</td>
                  <td className="py-3 type-body text-ink-soft">{discount.scope}</td>
                  <td className="py-3 type-body">{discount.isActive ? 'Active' : 'Inactive'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-4">
                      <Link
                        href={`/admin/discounts/${discount.id}`}
                        className="type-body text-signal"
                      >
                        Edit
                      </Link>
                      <form
                        action={setDiscountActiveAction.bind(
                          null,
                          discount.id,
                          !discount.isActive,
                        )}
                      >
                        <button type="submit" className="type-body text-ink-soft underline">
                          {discount.isActive ? 'Deactivate' : 'Activate'}
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
