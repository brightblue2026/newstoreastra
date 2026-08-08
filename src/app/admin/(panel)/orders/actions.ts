'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OrderStatus } from '@/generated/prisma/enums';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { transitionOrder } from '@/lib/orders';
import { requireOrderAccess } from '@/lib/session';

/*
  Fulfilment. STAFF and above, per §6: "View orders, update fulfilment, print
  invoices and labels."

  The actor passed to `transitionOrder` is `'STAFF'` regardless of who is signed
  in — an ADMIN is not allowed to confirm a payment by hand either. That
  transition belongs to the webhook, and §10 says so without an exception for
  seniority. The state machine refuses it; this file does not have to remember to.
*/

export interface OrderActionState {
  error?: string;
  saved?: string;
}

const transitionSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  to: z.enum(Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]]),
});

export async function transitionOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderAccess();

  const parsed = transitionSchema.safeParse({
    orderId: formData.get('orderId'),
    to: formData.get('to'),
  });

  if (!parsed.success) {
    return { error: 'That is not a status an order can be moved to.' };
  }

  const before = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true },
  });
  if (!before) return { error: 'That order no longer exists.' };

  const result = await transitionOrder({
    orderId: parsed.data.orderId,
    to: parsed.data.to,
    actor: 'STAFF',
  });

  if (!result.ok) return { error: result.error };

  const after = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true },
  });

  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Order',
    entityId: parsed.data.orderId,
    before,
    after,
  });

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { saved: `${before.orderNumber} is now ${parsed.data.to.toLowerCase().replace('_', ' ')}.` };
}
