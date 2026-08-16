import 'server-only';
import { OrderStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
import { absoluteUrl } from '@/lib/site';
import { orderAccessToken } from '@/lib/order-access';
import { buildInvoiceData, InvoiceError } from '@/lib/invoice';
import { renderInvoicePdf } from '@/lib/invoice-pdf';
import { orderConfirmedEmail, orderShippedEmail, sendEmail } from '@/lib/email';
import { sendNotification, type NotificationTemplate } from '@/lib/msg91';
import type { OrderAddressSnapshot } from '@/lib/orders';

/*
  What a customer is told, and when.

  One entry point, `notifyOrderEvent`, called *after* a status has already moved
  and always outside the transaction that moved it. That placement is the whole
  design:

    - A third party must never be able to roll back a sale. If Resend is down
      when a Razorpay webhook confirms an order, the order stays confirmed and
      the customer does not get an email. The reverse — rolling back a paid
      order because an email failed — would be indefensible.
    - Equally, a notification must never be sent for a transition that did not
      commit. Calling this after the transaction returns is what guarantees the
      customer is only ever told things that are true.

  Everything here is best-effort and every failure is logged rather than
  thrown. `notifyOrderEvent` resolves even when nothing could be sent.

  Not built: a retry queue. A failed WhatsApp send is not retried, and a failed
  email is not either. Doing that properly needs a durable job store this
  deployment does not have, and the honest alternative — an in-process retry on
  a serverless function that is about to be frozen — would mostly pretend. The
  customer-facing order page is always correct regardless, and it is linked from
  every message.
*/

export type OrderEvent = 'CONFIRMED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

const EVENT_TO_TEMPLATE: Readonly<Record<OrderEvent, NotificationTemplate>> = Object.freeze({
  CONFIRMED: 'ORDER_CONFIRMED',
  SHIPPED: 'ORDER_SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'ORDER_DELIVERED',
});

/** Statuses that have a customer message. Everything else is internal. */
function eventForStatus(status: OrderStatus): OrderEvent | null {
  if (status === OrderStatus.CONFIRMED) return 'CONFIRMED';
  if (status === OrderStatus.SHIPPED) return 'SHIPPED';
  if (status === OrderStatus.DELIVERED) return 'DELIVERED';
  return null;
}

export interface NotifyResult {
  whatsapp: { sent: boolean; channel: string; reason: string | null } | null;
  email: { sent: boolean; reason: string | null } | null;
  invoiceAttached: boolean;
}

const NOTHING_SENT: NotifyResult = {
  whatsapp: null,
  email: null,
  invoiceAttached: false,
};

/**
 * Tell the customer what just happened to their order.
 *
 * `event` accepts an `OrderStatus` as well as an `OrderEvent`, because the two
 * webhooks call it with whatever they just transitioned to — a status that has
 * no customer message resolves to a no-op rather than an error.
 */
export async function notifyOrderEvent(input: {
  orderId: string;
  event: OrderEvent | OrderStatus;
}): Promise<NotifyResult> {
  const event =
    input.event in EVENT_TO_TEMPLATE
      ? (input.event as OrderEvent)
      : eventForStatus(input.event as OrderStatus);

  if (!event) return NOTHING_SENT;

  try {
    return await dispatch(input.orderId, event);
  } catch (error) {
    // The catch-all is the point of this function's contract: a notification
    // failure must never propagate into an order transition.
    console.error('[notifications] failed for order', input.orderId, event, error);
    return NOTHING_SENT;
  }
}

async function dispatch(orderId: string, event: OrderEvent): Promise<NotifyResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      totalPaise: true,
      paymentMethod: true,
      guestEmail: true,
      guestPhone: true,
      shippingAddress: true,
      awbNumber: true,
      courierName: true,
      trackingUrl: true,
      invoiceNumber: true,
      user: { select: { email: true, phone: true, name: true } },
      items: { select: { nameSnapshot: true, quantity: true, totalPaise: true } },
    },
  });

  if (!order) {
    console.error('[notifications] no such order', orderId);
    return NOTHING_SENT;
  }

  const address = order.shippingAddress as unknown as OrderAddressSnapshot | null;
  const customerName = address?.fullName?.trim() || order.user?.name?.trim() || 'there';
  const phone = address?.phone?.trim() || order.guestPhone?.trim() || order.user?.phone?.trim() || '';
  const email = order.guestEmail?.trim() || order.user?.email?.trim() || '';

  const totalFormatted = formatINR(order.totalPaise);
  const isCod = order.paymentMethod === 'COD';

  // The customer's own order page, with the capability token that opens it —
  // the same link the confirmation page shows. It never expires, so it stays
  // useful in an email a month old.
  const trackingUrl = absoluteUrl(
    `/order/${order.orderNumber}?t=${orderAccessToken(order.orderNumber)}`,
  );

  const whatsapp = phone
    ? await sendNotification({
        template: EVENT_TO_TEMPLATE[event],
        phone,
        variables: whatsappVariables({
          event,
          customerName,
          orderNumber: order.orderNumber,
          totalFormatted,
          isCod,
          courierName: order.courierName,
          awbNumber: order.awbNumber,
          trackingUrl: order.trackingUrl ?? trackingUrl,
          email,
        }),
      })
    : null;

  if (whatsapp && !whatsapp.sent) {
    console.warn('[notifications]', order.orderNumber, event, 'not messaged:', whatsapp.reason);
  }

  // Email carries the invoice, so it only goes on the two events where there is
  // something to attach or track. "Out for delivery" is a WhatsApp-only
  // message: it is time-sensitive and an email arriving after the van has been
  // is noise.
  let emailResult: NotifyResult['email'] = null;
  let invoiceAttached = false;

  if (email && (event === 'CONFIRMED' || event === 'SHIPPED')) {
    const attachments =
      event === 'CONFIRMED' && order.invoiceNumber
        ? await invoiceAttachment(order.id, order.invoiceNumber)
        : [];
    invoiceAttached = attachments.length > 0;

    const content =
      event === 'CONFIRMED'
        ? orderConfirmedEmail({
            customerName,
            orderNumber: order.orderNumber,
            totalFormatted,
            paymentLine: isCod
              ? `To be paid in cash on delivery: ${totalFormatted}`
              : 'Paid online',
            items: order.items.map((item) => ({
              name: item.nameSnapshot,
              quantity: item.quantity,
              total: formatINR(item.totalPaise),
            })),
            trackingUrl,
            hasInvoice: invoiceAttached,
          })
        : orderShippedEmail({
            customerName,
            orderNumber: order.orderNumber,
            courierName: order.courierName ?? 'our courier',
            awbNumber: order.awbNumber ?? '—',
            trackingUrl: order.trackingUrl ?? trackingUrl,
          });

    const sent = await sendEmail({
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments,
      replyTo: 'info@brightblue.in',
    });

    if (!sent.sent) {
      console.warn('[notifications]', order.orderNumber, event, 'email failed:', sent.reason);
    }
    emailResult = { sent: sent.sent, reason: sent.reason };
  }

  return {
    whatsapp: whatsapp
      ? { sent: whatsapp.sent, channel: whatsapp.channel, reason: whatsapp.reason }
      : null,
    email: emailResult,
    invoiceAttached,
  };
}

/**
 * Render the invoice for attachment.
 *
 * A failure here degrades to an email with no attachment rather than no email —
 * the confirmation is the more important of the two, and the invoice stays
 * downloadable from the order page either way.
 */
async function invoiceAttachment(
  orderId: string,
  invoiceNumber: string,
): Promise<{ filename: string; content: Buffer }[]> {
  try {
    const data = await buildInvoiceData(orderId);
    const pdf = await renderInvoicePdf(data);
    return [
      {
        // Slashes are legal in the invoice number and illegal in a filename.
        filename: `invoice-${invoiceNumber.replace(/\//g, '-')}.pdf`,
        content: pdf,
      },
    ];
  } catch (error) {
    if (error instanceof InvoiceError) {
      console.warn('[notifications] no invoice to attach for', orderId, '—', error.message);
    } else {
      console.error('[notifications] could not render the invoice for', orderId, error);
    }
    return [];
  }
}

/**
 * The template variables, in the order `docs/msg91-templates.md` submits them.
 *
 * That document is the contract with Meta — the positions here have to match
 * it exactly, because a template's variables are positional and getting them
 * out of order produces a message that is grammatical and wrong.
 */
function whatsappVariables(input: {
  event: OrderEvent;
  customerName: string;
  orderNumber: string;
  totalFormatted: string;
  isCod: boolean;
  courierName: string | null;
  awbNumber: string | null;
  trackingUrl: string;
  email: string;
}): string[] {
  switch (input.event) {
    case 'CONFIRMED':
      // {{1}} name, {{2}} order number, {{3}} total, {{4}} payment method
      return [
        input.customerName,
        input.orderNumber,
        input.totalFormatted,
        input.isCod ? 'Cash on delivery' : 'UPI / card',
      ];

    case 'SHIPPED':
      // {{1}} name, {{2}} order number, {{3}} courier, {{4}} AWB, {{5}} tracking URL
      return [
        input.customerName,
        input.orderNumber,
        input.courierName ?? 'our courier',
        input.awbNumber ?? '—',
        input.trackingUrl,
      ];

    case 'OUT_FOR_DELIVERY':
      // {{3}} is a full sentence, not an amount — a prepaid order has no
      // amount to state and a template variable cannot be conditionally
      // absent. See the note in docs/msg91-templates.md.
      return [
        input.customerName,
        input.orderNumber,
        input.isCod
          ? `Please keep ${input.totalFormatted} ready.`
          : 'Nothing to pay on delivery.',
      ];

    case 'DELIVERED':
      // {{1}} name, {{2}} order number, {{3}} email the invoice went to.
      return [input.customerName, input.orderNumber, input.email || 'you'];
  }
}
