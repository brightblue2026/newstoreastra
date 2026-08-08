'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { orderAccessToken, phoneMatches } from '@/lib/order-access';

/*
  Unlocking an order page with the mobile number on it — brief §12 Phase 6's
  "customer tracking via order number + phone, no login", needed here in Phase 5
  for the confirmation page.

  On a match this mints the capability token and redirects to the same page
  carrying it, so the customer ends up on a link they can keep. On a mismatch it
  redirects back with a flag rather than rendering a message inline, because the
  page is a server component and this keeps it that way — no client JavaScript is
  needed to look at an order.

  One message for a wrong number and for an order number that does not exist. A
  form that distinguishes them is a form that tells a stranger which order
  numbers are real.
*/

const schema = z.object({
  orderNumber: z.string().trim().min(6).max(24),
  phone: z.string().trim().min(6).max(20),
});

export async function unlockOrder(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    orderNumber: formData.get('orderNumber'),
    phone: formData.get('phone'),
  });

  if (!parsed.success) {
    redirect('/order');
  }

  const orderNumber = parsed.data.orderNumber.toUpperCase();

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { guestPhone: true, user: { select: { phone: true } } },
  });

  const matches =
    order !== null &&
    (phoneMatches(parsed.data.phone, order.guestPhone) ||
      phoneMatches(parsed.data.phone, order.user?.phone));

  if (!matches) {
    redirect(`/order/${encodeURIComponent(orderNumber)}?denied=1`);
  }

  redirect(`/order/${encodeURIComponent(orderNumber)}?t=${orderAccessToken(orderNumber)}`);
}
