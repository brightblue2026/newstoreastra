import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatRate } from '@/lib/gst';
import { formatINR } from '@/lib/money';
import { ORDER_STATUS_LABELS, OrderStatus, staffTransitions } from '@/lib/order-status';
import { getOrderByNumber } from '@/lib/order-view';
import { requireOrderAccess } from '@/lib/session';
import FulfilmentActions from './fulfilment-actions';
import StatusForm from './status-form';

export const dynamic = 'force-dynamic';

/*
  One order, in full.

  This is the screen a parcel is packed from, so it leads with what is in the
  box and where it goes, and keeps the money underneath. The per-HSN tax table is
  here because it is what the invoice will print and it is worth being able to
  check before Phase 6 generates one.
*/
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireOrderAccess();
  const { orderId } = await params;

  // The read model is keyed by order number — the id is what the list links by,
  // so this resolves one to the other rather than duplicating the projection.
  const row = await db.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  if (!row) notFound();

  const order = await getOrderByNumber(row.orderNumber);
  if (!order) notFound();

  const status = order.status as OrderStatus;

  return (
    <div>
      <p className="type-caption text-ink-soft">
        <Link href="/admin/orders" className="underline">
          Orders
        </Link>
      </p>

      <h1 className="mt-4 type-display-sm type-mono">{order.orderNumber}</h1>

      <dl className="mt-8 grid gap-6 border-y border-line py-6 sm:grid-cols-4">
        <Fact label="Placed">
          {order.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </Fact>
        <Fact label="Status">{ORDER_STATUS_LABELS[status] ?? order.status}</Fact>
        <Fact label="Payment">
          {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'} ·{' '}
          {order.paymentStatus.toLowerCase()}
        </Fact>
        <Fact label="Seller of record">{order.sellerLegalName ?? '—'}</Fact>
      </dl>

      <section className="mt-12">
        <h2 className="type-heading">Fulfilment</h2>
        <div className="mt-4">
          <StatusForm orderId={order.id} transitions={staffTransitions(status)} />
        </div>
        {status === OrderStatus.PENDING_PAYMENT && (
          <p className="mt-4 max-w-prose type-caption text-ink-soft">
            This order has not been paid. Only a signature-verified Razorpay webhook can confirm
            it — there is deliberately no button here to do it by hand.
          </p>
        )}

        {status !== OrderStatus.PENDING_PAYMENT && (
          <FulfilmentActions
            orderId={order.id}
            shiprocketShipmentId={order.shiprocketShipmentId}
            awbNumber={order.awbNumber}
            courierName={order.courierName}
            trackingUrl={order.trackingUrl}
            labelUrl={order.labelUrl}
            manifestUrl={order.manifestUrl}
            pickupRequested={order.pickupRequestedAt !== null}
            shiprocketError={order.shiprocketError}
            delivered={status === OrderStatus.DELIVERED}
          />
        )}
      </section>

      <section className="mt-16">
        <h2 className="type-heading">Items</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-3xl">
            <thead>
              <tr className="border-b border-line text-left type-caption text-ink-soft">
                <th scope="col" className="py-3 font-normal">
                  Item
                </th>
                <th scope="col" className="py-3 font-normal">
                  SKU
                </th>
                <th scope="col" className="py-3 font-normal">
                  HSN
                </th>
                <th scope="col" className="py-3 font-normal">
                  GST
                </th>
                <th scope="col" className="py-3 text-right font-normal">
                  Qty
                </th>
                <th scope="col" className="py-3 text-right font-normal">
                  Unit
                </th>
                <th scope="col" className="py-3 text-right font-normal">
                  Line total
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-line align-top">
                  <td className="py-3 type-body">
                    {item.nameSnapshot}
                    {item.choiceSnapshot?.map((choice) => (
                      <span key={choice.slotLabel} className="block type-caption text-ink-soft">
                        {choice.slotLabel}: {choice.picks.join(', ')}
                      </span>
                    ))}
                  </td>
                  <td className="py-3 type-mono text-ink-soft">{item.skuSnapshot}</td>
                  <td className="py-3 type-mono text-ink-soft">{item.hsnCode}</td>
                  <td className="py-3 type-caption text-ink-soft">{formatRate(item.gstRate)}</td>
                  <td className="py-3 text-right type-body tabular-nums">{item.quantity}</td>
                  <td className="py-3 text-right type-body tabular-nums" data-price>
                    {formatINR(item.unitPricePaise)}
                  </td>
                  <td className="py-3 text-right type-body tabular-nums" data-price>
                    {formatINR(item.totalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-prose type-caption text-ink-soft">
          A combo appears as one line per component, each with its own HSN code and rate. The
          package price is apportioned across them by value — a bundle has no HSN of its own, and
          a mixed-rate invoice has to reconcile line by line.
        </p>
      </section>

      <div className="mt-16 grid gap-12 sm:grid-cols-2">
        <section>
          <h2 className="type-heading">Deliver to</h2>
          {order.shippingAddress ? (
            <address className="mt-4 not-italic type-body text-ink-soft">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 && (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              )}
              <br />
              {order.shippingAddress.city} {order.shippingAddress.pincode}
              <br />
              {order.shippingAddress.state}
              <br />
              {order.shippingAddress.phone}
            </address>
          ) : (
            <p className="mt-4 type-body text-ink-soft">Not recorded.</p>
          )}

          <h3 className="mt-8 type-subhead">Contact</h3>
          <p className="mt-2 type-body text-ink-soft">
            {order.guestPhone ?? order.customerPhone ?? '—'}
            {order.guestEmail && (
              <>
                <br />
                {order.guestEmail}
              </>
            )}
          </p>

          {order.notes && (
            <>
              <h3 className="mt-8 type-subhead">Notes</h3>
              <p className="mt-2 type-body text-ink-soft">{order.notes}</p>
            </>
          )}
        </section>

        <section>
          <h2 className="type-heading">Money</h2>
          <dl className="mt-4 space-y-2">
            <Row label="Subtotal" value={formatINR(order.subtotalPaise)} />
            {order.appliedDiscounts.map((discount, index) => (
              <Row
                key={`${discount.code ?? 'offer'}-${index}`}
                label={discount.code ? `Discount ${discount.code}` : 'Discount'}
                value={`−${formatINR(discount.amountPaise)}`}
              />
            ))}
            <Row
              label="Delivery"
              value={order.shippingPaise === 0 ? 'Free' : formatINR(order.shippingPaise)}
            />
            {order.codFeePaise > 0 && (
              <Row label="COD fee" value={formatINR(order.codFeePaise)} />
            )}
            <div className="flex justify-between border-t border-line pt-2 type-body-lg">
              <dt>Total</dt>
              <dd className="font-medium tabular-nums" data-price>
                {formatINR(order.totalPaise)}
              </dd>
            </div>
          </dl>

          <h3 className="mt-8 type-subhead">
            GST, by HSN ({order.intraState ? 'CGST + SGST' : 'IGST'})
          </h3>
          {order.taxRows.length === 0 ? (
            <p className="mt-2 type-caption text-ink-soft">No tax breakdown recorded.</p>
          ) : (
            <table className="mt-2 w-full type-caption">
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th scope="col" className="py-2 font-normal">
                    HSN
                  </th>
                  <th scope="col" className="py-2 font-normal">
                    Rate
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Taxable
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    {order.intraState ? 'CGST' : 'IGST'}
                  </th>
                  {order.intraState && (
                    <th scope="col" className="py-2 text-right font-normal">
                      SGST
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {order.taxRows.map((taxRow) => (
                  <tr key={`${taxRow.hsn}-${taxRow.rate}`} className="border-b border-line">
                    <td className="py-2 type-mono">{taxRow.hsn}</td>
                    <td className="py-2">{formatRate(taxRow.rate)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatINR(taxRow.taxablePaise)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatINR(order.intraState ? taxRow.cgstPaise : taxRow.igstPaise)}
                    </td>
                    {order.intraState && (
                      <td className="py-2 text-right tabular-nums">
                        {formatINR(taxRow.sgstPaise)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mt-4 type-caption text-ink-soft">
            {order.invoiceNumber ? (
              <>
                Invoice {order.invoiceNumber}
                {' — '}
                {/* Staff-authorised by session — no capability token needed here,
                    unlike the customer-facing link on the order tracking page. */}
                <a
                  href={`/api/invoice/${order.orderNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  download
                </a>
              </>
            ) : (
              'No invoice raised yet — one is raised automatically when the order is confirmed.'
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="type-caption text-ink-soft">{label}</dt>
      <dd className="mt-1 type-body">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between type-body">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums" data-price>
        {value}
      </dd>
    </div>
  );
}
