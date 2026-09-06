import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { CONTACT } from '@/lib/contact';
import { formatINR } from '@/lib/money';
import { formatRate } from '@/lib/gst';
import { isValidOrderToken } from '@/lib/order-access';
import { ORDER_STATUS_LABELS, OrderStatus } from '@/lib/order-status';
import { getOrderByNumber, type OrderView } from '@/lib/order-view';
import { unlockOrder } from '@/server/actions/order-access';

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/*
  The confirmation and tracking page.

  Two things it is careful about:

  1. **It never claims an order is paid.** For a prepaid order it reads the real
     `status`, which only the signed webhook can move — so straight after
     Razorpay Checkout closes, this says the payment is being confirmed, and it
     starts saying "Confirmed" when the webhook has actually landed. §10 forbids
     the browser deciding otherwise, and a page that congratulated the customer
     on a payment that later failed would be the visible form of that mistake.

  2. **It is not readable by order number alone.** Numbers are sequential.
     Access comes from the capability token minted at placement, or from the
     mobile number on the order — see `lib/order-access.ts`.
*/

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string; denied?: string; payment?: string }>;
}) {
  const { orderNumber: raw } = await params;
  const { t, denied, payment } = await searchParams;
  const orderNumber = decodeURIComponent(raw).trim().toUpperCase();

  if (!isValidOrderToken(orderNumber, t ?? null)) {
    return (
      <Unlock orderNumber={orderNumber} denied={denied === '1'} />
    );
  }

  let order: OrderView | null;
  try {
    order = await getOrderByNumber(orderNumber);
  } catch (error) {
    console.error('[order] could not be read:', error);
    return (
      <Shell title="We cannot reach your order just now">
        <p className="type-body text-ink-soft">
          Nothing is wrong with the order itself. Try again in a moment, or call{' '}
          {CONTACT.tollFree}.
        </p>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell title="We couldn't find that order">
        <p className="type-body text-ink-soft">
          Check the order number and the link from your confirmation — both have to match.
          If it still doesn&apos;t open, call {CONTACT.tollFree} and we can look it up.
        </p>
        <Link href="/shop" className="mt-8 inline-block type-body text-signal">
          Back to the catalogue
        </Link>
      </Shell>
    );
  }

  const awaitingPayment = order.status === OrderStatus.PENDING_PAYMENT;

  return (
    <Shell
      title={awaitingPayment ? 'Order placed — awaiting payment' : `Order ${order.orderNumber}`}
    >
      <p className="type-body text-ink-soft">
        {awaitingPayment
          ? payment === 'submitted'
            ? 'Thank you. We are confirming the payment with the bank — this page updates once it clears, usually within a minute.'
            : 'This order is waiting for payment. Nothing has been charged yet.'
          : `Thank you. We have your order and will send updates to ${
              order.shippingAddress?.phone ?? 'your mobile'
            } on WhatsApp.`}
      </p>

      <dl className="mt-12 grid gap-6 sm:grid-cols-3">
        <Fact label="Order number" value={order.orderNumber} mono />
        <Fact label="Status" value={statusLabel(order.status)} />
        <Fact
          label="Payment"
          value={
            order.paymentMethod === 'COD'
              ? 'Cash on delivery'
              : order.paymentStatus === 'PAID'
                ? 'Paid online'
                : order.paymentStatus === 'FAILED'
                  ? 'Payment failed'
                  : 'Awaiting confirmation'
          }
        />
      </dl>

      {/* Items. A combo's components are separate lines because each carries its
          own HSN code and GST rate — the same reason the invoice will show them
          separately. The line names say which package they came from. */}
      <section className="mt-16">
        <h2 className="type-subhead">What is coming</h2>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-4">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-control bg-sky">
                {item.imageSnapshot && (
                  <Image
                    src={item.imageSnapshot}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-contain p-1"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="type-body">{item.nameSnapshot}</p>
                <p className="type-caption text-ink-soft">
                  <span className="type-mono">{item.skuSnapshot}</span> · Quantity {item.quantity}
                </p>
                {item.choiceSnapshot?.map((choice) => (
                  <p key={choice.slotLabel} className="type-caption text-ink-soft">
                    {choice.slotLabel}: {choice.picks.join(', ')}
                  </p>
                ))}
              </div>
              <p className="type-body tabular-nums" data-price>
                {formatINR(item.totalPaise)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-16 grid gap-12 sm:grid-cols-2">
        <section>
          <h2 className="type-subhead">Delivering to</h2>
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

          {order.awbNumber && (
            <p className="mt-6 type-body">
              {order.courierName ?? 'Courier'} · <span className="type-mono">{order.awbNumber}</span>
              {order.trackingUrl && (
                <>
                  {' '}
                  <a href={order.trackingUrl} className="underline">
                    Track
                  </a>
                </>
              )}
            </p>
          )}
        </section>

        <section>
          <h2 className="type-subhead">What it came to</h2>
          <dl className="mt-4 space-y-2">
            <Row label="Subtotal" value={formatINR(order.subtotalPaise)} />
            {order.discountPaise > 0 && (
              <Row label="Discount" value={`−${formatINR(order.discountPaise)}`} />
            )}
            <Row
              label="Delivery"
              value={order.shippingPaise === 0 ? 'Free' : formatINR(order.shippingPaise)}
            />
            {order.codFeePaise > 0 && (
              <Row label="Cash-on-delivery fee" value={formatINR(order.codFeePaise)} />
            )}
            <div className="flex justify-between border-t border-line pt-2 type-body-lg">
              <dt>Total</dt>
              <dd className="font-medium tabular-nums" data-price>
                {formatINR(order.totalPaise)}
              </dd>
            </div>
          </dl>

          {/* The per-HSN table §10 requires on the invoice, shown here too: this
              catalogue spans 18%, 12%, 5% and nil-rated goods, so one blended
              rate would be a fiction. */}
          {order.taxRows.length > 0 && (
            <table className="mt-6 w-full type-caption">
              <caption className="text-left type-caption text-ink-soft">
                GST included, by HSN ({order.intraState ? 'CGST + SGST' : 'IGST'})
              </caption>
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
                    Tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.taxRows.map((row) => (
                  <tr key={`${row.hsn}-${row.rate}`} className="border-b border-line">
                    <td className="py-2 type-mono">{row.hsn}</td>
                    <td className="py-2">{formatRate(row.rate)}</td>
                    <td className="py-2 text-right tabular-nums">{formatINR(row.taxablePaise)}</td>
                    <td className="py-2 text-right tabular-nums">{formatINR(row.taxPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="mt-16 type-caption text-ink-soft">
        Keep this page bookmarked to check on the order, or call {CONTACT.tollFree} with the order
        number. The tax invoice follows by email once the order ships.
      </p>
    </Shell>
  );
}

function statusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-16">
      <h1 className="type-display-sm">{title}</h1>
      <div className="mt-6 max-w-prose">{children}</div>
    </div>
  );
}

/**
 * The gate. Shown whenever there is no valid token, including for an order
 * number that does not exist — the form must not tell a stranger which numbers
 * are real.
 */
function Unlock({ orderNumber, denied }: { orderNumber: string; denied: boolean }) {
  return (
    <Shell title="Look up your order">
      <p className="type-body text-ink-soft">
        Enter the mobile number the order was placed with. We ask for it because order numbers
        run in sequence, and yours should not be readable by someone guessing.
      </p>

      <form action={unlockOrder} className="mt-8 space-y-4">
        <input type="hidden" name="orderNumber" value={orderNumber} />

        <label className="block">
          <span className="block type-caption text-ink-soft">Order number</span>
          <span className="mt-2 block type-mono">{orderNumber}</span>
        </label>

        <label className="block">
          <span className="block type-caption text-ink-soft">Mobile number</span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            className="mt-2 w-full max-w-xs rounded-control border border-line bg-paper px-4 py-3 type-body"
          />
        </label>

        {denied && (
          <p role="alert" className="type-caption text-warning">
            That order number and mobile number do not go together. Check both, or call{' '}
            {CONTACT.tollFree}.
          </p>
        )}

        <button
          type="submit"
          className="rounded-control bg-signal px-8 py-4 type-body font-medium text-paper motion-lift"
        >
          Show my order
        </button>
      </form>

      <p className="mt-8 type-caption text-ink-soft">
        <Link href="/shop" className="underline">
          Back to the shop
        </Link>
      </p>
    </Shell>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="type-caption text-ink-soft">{label}</dt>
      <dd className={`mt-1 type-body ${mono ? 'type-mono' : ''}`}>{value}</dd>
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
