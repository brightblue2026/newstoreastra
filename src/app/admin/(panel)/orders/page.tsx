import Link from '@/components/Link';
import { OrderStatus } from '@/generated/prisma/enums';
import { formatINR } from '@/lib/money';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import { listOrders, type OrderListRow } from '@/lib/order-view';
import { requireOrderAccess } from '@/lib/session';

export const dynamic = 'force-dynamic';

/*
  The order queue — newest first, because that is the order staff work in.

  Open to STAFF. §6 bars STAFF from prices, products and discounts, not from
  order totals: they have to print invoices and hand parcels to a courier, and
  neither is possible without seeing what the order came to.
*/
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireOrderAccess();
  const { status, q } = await searchParams;

  const validStatus = status && status in OrderStatus ? status : undefined;

  let orders: OrderListRow[] = [];
  let failed = false;
  try {
    orders = await listOrders({ status: validStatus, query: q });
  } catch (error) {
    console.error('[admin] could not list orders:', error);
    failed = true;
  }

  return (
    <div>
      <h1 className="type-display-sm">Orders</h1>

      <form className="mt-8 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="block type-caption text-ink-soft">Order number or phone</span>
          <input
            name="q"
            defaultValue={q ?? ''}
            className="mt-2 rounded-control border border-line bg-paper px-4 py-2 type-body"
          />
        </label>
        <label className="block">
          <span className="block type-caption text-ink-soft">Status</span>
          <select
            name="status"
            defaultValue={validStatus ?? ''}
            className="mt-2 rounded-control border border-line bg-paper px-4 py-2 type-body"
          >
            <option value="">Any</option>
            {Object.values(OrderStatus).map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-control border border-ink px-4 py-2 type-body"
        >
          Filter
        </button>
        {(validStatus || q) && (
          <Link href="/admin/orders" className="type-caption underline">
            Clear
          </Link>
        )}
      </form>

      {failed ? (
        <p className="mt-12 type-body text-warning">
          The order list could not be read. The orders themselves are unaffected.
        </p>
      ) : orders.length === 0 ? (
        <p className="mt-12 type-body text-ink-soft">
          {validStatus || q
            ? 'No orders match that filter.'
            : 'No orders yet. The first one will appear here the moment it is placed.'}
        </p>
      ) : (
        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-3xl">
            <thead>
              <tr className="border-b border-line text-left type-caption text-ink-soft">
                <th scope="col" className="py-3 font-normal">
                  Order
                </th>
                <th scope="col" className="py-3 font-normal">
                  Placed
                </th>
                <th scope="col" className="py-3 font-normal">
                  Customer
                </th>
                <th scope="col" className="py-3 font-normal">
                  Status
                </th>
                <th scope="col" className="py-3 font-normal">
                  Payment
                </th>
                <th scope="col" className="py-3 text-right font-normal">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-line align-top">
                  <td className="py-3">
                    <Link href={`/admin/orders/${order.id}`} className="type-mono text-signal">
                      {order.orderNumber}
                    </Link>
                    <span className="block type-caption text-ink-soft">
                      {order.itemCount} {order.itemCount === 1 ? 'line' : 'lines'}
                    </span>
                  </td>
                  <td className="py-3 type-caption text-ink-soft">
                    {order.createdAt.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-3 type-body">
                    {order.customerName}
                    <span className="block type-caption text-ink-soft">{order.place}</span>
                  </td>
                  <td className="py-3 type-body">
                    {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                  </td>
                  <td className="py-3 type-caption text-ink-soft">
                    {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}
                    <span className="block">{order.paymentStatus.toLowerCase()}</span>
                  </td>
                  <td className="py-3 text-right type-body tabular-nums" data-price>
                    {formatINR(order.totalPaise)}
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
