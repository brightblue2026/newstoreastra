import { logServerFailure } from '@/lib/security-log';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildInvoiceData, InvoiceError } from '@/lib/invoice';
import { renderInvoicePdf } from '@/lib/invoice-pdf';
import { isValidOrderToken } from '@/lib/order-access';
import { currentUser } from '@/lib/session';
import { canHandleOrders } from '@/lib/roles';

/*
  GET /api/invoice/BB-2627-00001 — the tax invoice as a PDF.

  One route serves both audiences, because it is one document and duplicating
  the renderer for staff and customer is how the two drift apart:

    - **A customer** presents the capability token from their order link
      (`?t=…`). Same credential as the order page itself — an order number
      alone is never enough, because the numbers run in sequence.
    - **A member of staff** is authorised by session role. §6 gives STAFF
      "print invoices" explicitly, so `canHandleOrders` is the check, not
      `canSeePricing`.

  A missing order and a wrong token return the same 404. Distinguishing them
  tells a stranger which order numbers exist.

  The PDF is rendered on demand rather than stored. `Order.invoiceUrl` exists in
  the schema for a hosted copy, but nothing needs one yet: the document is
  derived entirely from immutable order snapshots, so re-rendering it is
  deterministic and always agrees with what was charged. Storing a copy would
  add a bucket to keep in sync with no reader asking for it.
*/

export const runtime = 'nodejs'; // @react-pdf/renderer needs Node, not the edge.
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber: raw } = await params;
  const orderNumber = raw.trim().toUpperCase();

  const token = new URL(request.url).searchParams.get('t');

  let authorised = isValidOrderToken(orderNumber, token);

  if (!authorised) {
    const user = await currentUser();
    authorised = Boolean(user && canHandleOrders(user.role));
  }

  if (!authorised) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { id: true, invoiceNumber: true },
  });

  if (!order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!order.invoiceNumber) {
    // An honest 409 rather than a 404: the order exists and the caller may see
    // it, but no invoice has been raised because it is not confirmed yet.
    return NextResponse.json(
      { error: 'No invoice has been raised for this order yet.' },
      { status: 409 },
    );
  }

  try {
    const data = await buildInvoiceData(order.id);
    const pdf = await renderInvoicePdf(data);
    const filename = `invoice-${order.invoiceNumber.replace(/\//g, '-')}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        // A tax invoice never changes once raised, but it must never be cached
        // by a shared proxy — it is one customer's document.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      console.warn('[invoice]', orderNumber, error.message);
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logServerFailure('invoice.render', error);
    return NextResponse.json({ error: 'Could not generate the invoice.' }, { status: 500 });
  }
}
