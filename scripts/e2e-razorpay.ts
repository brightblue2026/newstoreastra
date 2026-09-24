/*
  End-to-end check of the Razorpay payment path against a running dev server
  and the LOCAL database.

    RAZORPAY_WEBHOOK_SECRET=whsec_local pnpm dev          # one terminal
    RAZORPAY_WEBHOOK_SECRET=whsec_local pnpm e2e:razorpay # another

  It places real prepaid orders through `placeOrder`, then posts signed
  webhooks at /api/webhooks/razorpay: forged and missing signatures, an
  authorised-only payment, an underpayment, a failure, the capture, replays,
  concurrent redeliveries, a payment landing on an already-cancelled order,
  and a Razorpay order-creation failure. Everything it creates is deleted and
  every inventory row it touched is put back exactly, so it can be re-run.

  The secret only has to match between the two processes; it needs no
  Razorpay account. Nothing leaves the machine except one deliberately
  unauthenticated call to api.razorpay.com. It refuses to run against anything
  but a local database, because it writes orders and moves stock.
*/

import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { placeOrder, startPayment, transitionOrder } from '@/lib/orders';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
let VARIANT = '';
let failures = 0;
/** Every order this run creates, so cleanup can find them even after a crash. */
const created: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function stock() {
  const rows = await db.inventory.findMany({ where: { variantId: VARIANT } });
  return {
    quantity: rows.reduce((a, r) => a + r.quantity, 0),
    reserved: rows.reduce((a, r) => a + r.reserved, 0),
  };
}

async function newPrepaidOrder(tag: string) {
  const placed = await placeOrder({
    lines: [{ kind: 'VARIANT', id: VARIANT, quantity: 2 }],
    phone: '9847012345',
    email: 'e2e@example.com',
    paymentMethod: 'RAZORPAY',
    shipping: {
      fullName: 'E2E Tester',
      phone: '9847012345',
      line1: '12 Test Road',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    notes: `e2e ${tag}`,
  });
  if (!placed.ok) throw new Error(`placeOrder failed: ${placed.error}`);
  created.push(placed.order.id);
  const rzpOrderId = `order_E2E${tag}${Date.now()}`;
  await db.order.update({ where: { id: placed.order.id }, data: { razorpayOrderId: rzpOrderId } });
  return { ...placed.order, rzpOrderId };
}

async function send(event: string, entity: Record<string, unknown>, secret = SECRET ?? '') {
  const body = JSON.stringify({ event, payload: { payment: { entity } } });
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig },
    body,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const read = (id: string) =>
  db.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, paymentStatus: true, razorpayPaymentId: true, invoiceNumber: true, notes: true },
  });

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(dbHost)) {
    throw new Error(`Refusing to run: DATABASE_URL points at ${dbHost}, not a local database.`);
  }
  if (!SECRET) {
    throw new Error('Set RAZORPAY_WEBHOOK_SECRET, to the same value the dev server was started with.');
  }

  const [candidate] = await db.$queryRaw<{ id: string }[]>`
    SELECT v.id FROM "ProductVariant" v
    JOIN "Inventory" i ON i."variantId" = v.id
    JOIN "Location" l ON l.id = i."locationId" AND l."isActive"
    WHERE v."pricePaise" IS NOT NULL
    GROUP BY v.id HAVING sum(i.quantity - i.reserved) >= 6
    LIMIT 1
  `;
  if (!candidate) throw new Error('No priced variant with at least 6 units in stock to order.');
  VARIANT = candidate.id;
  const inventorySnapshot = await db.inventory.findMany({
    where: { variantId: VARIANT },
    select: { id: true, quantity: true, reserved: true },
  });

  try {
    await run();
  } finally {
    // Remove every e2e order and put each inventory row back exactly.
    await db.orderItem.deleteMany({ where: { orderId: { in: created } } });
    await db.order.deleteMany({ where: { id: { in: created } } });
    for (const row of inventorySnapshot) {
      await db.inventory.update({
        where: { id: row.id },
        data: { quantity: row.quantity, reserved: row.reserved },
      });
    }
    const restored = await db.inventory.findMany({
      where: { variantId: VARIANT },
      select: { id: true, quantity: true, reserved: true },
    });
    check(
      'cleanup restored every inventory row',
      inventorySnapshot.every((row) => {
        const now = restored.find((r) => r.id === row.id);
        return now?.quantity === row.quantity && now.reserved === row.reserved;
      }),
    );
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await db.$disconnect();
  process.exit(failures ? 1 : 0);
}

async function run() {
  const before = await stock();

  // --- Order A: the happy path, with every hostile variant first ---
  const a = await newPrepaidOrder('A');
  const afterPlace = await stock();
  check('placing holds stock (reserved +2, quantity unchanged)',
    afterPlace.reserved === before.reserved + 2 && afterPlace.quantity === before.quantity, { before, afterPlace });

  const entity = { id: `pay_A${Date.now()}`, order_id: a.rzpOrderId, amount: a.totalPaise, currency: 'INR', status: 'captured' };

  let r = await send('payment.captured', entity, 'wrong-secret');
  check('forged signature -> 400', r.status === 400, r);
  r = await fetch(`${BASE}/api/webhooks/razorpay`, { method: 'POST', body: '{}' }).then(async (x) => ({ status: x.status, json: null }));
  check('missing signature -> 400', r.status === 400, r);

  r = await send('payment.authorized', { ...entity, status: 'authorized' });
  check('payment.authorized is ignored', r.status === 200 && r.json?.ignored === 'payment.authorized', r);
  check('  ...order still pending', (await read(a.id)).status === 'PENDING_PAYMENT');

  r = await send('payment.captured', { ...entity, amount: a.totalPaise - 100 });
  check('underpaid capture is refused', r.status === 200 && r.json?.ignored === 'amount mismatch', r);
  check('  ...order still pending', (await read(a.id)).status === 'PENDING_PAYMENT');

  r = await send('payment.failed', { ...entity, id: `pay_Afail${Date.now()}`, status: 'failed' });
  let o = await read(a.id);
  check('payment.failed marks payment FAILED, order stays pending',
    r.status === 200 && o.status === 'PENDING_PAYMENT' && o.paymentStatus === 'FAILED', { r, o });

  r = await send('payment.captured', entity);
  o = await read(a.id);
  const afterConfirm = await stock();
  check('payment.captured -> CONFIRMED + PAID', r.status === 200 && o.status === 'CONFIRMED' && o.paymentStatus === 'PAID', { r, o });
  check('  ...records the payment id', o.razorpayPaymentId === entity.id, o);
  check('  ...raises a tax invoice number', !!o.invoiceNumber, o);
  check('  ...commits stock (quantity -2, hold released)',
    afterConfirm.quantity === before.quantity - 2 && afterConfirm.reserved === before.reserved, { before, afterConfirm });

  const invoice = o.invoiceNumber;
  r = await send('payment.captured', entity);
  const afterReplay = await stock();
  check('replayed webhook is acknowledged as already handled', r.status === 200 && r.json?.status === 'already handled', r);
  check('  ...stock untouched by replay', afterReplay.quantity === afterConfirm.quantity && afterReplay.reserved === afterConfirm.reserved);
  check('  ...invoice number unchanged', (await read(a.id)).invoiceNumber === invoice);

  const [r1, r2] = await Promise.all([send('order.paid', entity), send('payment.captured', entity)]);
  check('concurrent redeliveries both 200', r1.status === 200 && r2.status === 200, { r1, r2 });
  const afterRace = await stock();
  check('  ...stock still untouched', afterRace.quantity === afterConfirm.quantity);

  // --- Order B: paid after the stale-order cron cancelled it ---
  const b = await newPrepaidOrder('B');
  await transitionOrder({ orderId: b.id, to: 'CANCELLED', actor: 'STAFF', note: 'e2e: simulated stale expiry' });
  const afterCancel = await stock();
  check('cancelling a pending order releases the hold', afterCancel.reserved === afterConfirm.reserved, afterCancel);
  const bPay = { id: `pay_B${Date.now()}`, order_id: b.rzpOrderId, amount: b.totalPaise, currency: 'INR', status: 'captured' };
  r = await send('payment.captured', bPay);
  o = await read(b.id);
  check('late payment on a cancelled order is flagged, not swallowed',
    r.json?.status === 'paid after cancellation' && o.status === 'CANCELLED' && o.paymentStatus === 'PAID' && !!o.notes?.includes(bPay.id), { r, o });
  check('  ...customer note kept', !!o.notes?.startsWith('e2e B'), o.notes);
  r = await send('payment.captured', bPay);
  check('  ...replay of that is a no-op', r.json?.status === 'already handled', r);

  // --- Order C: Razorpay rejects order creation (bad keys) -> auto-cancel ---
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'rzp_test_doesnotexist';
  process.env.RAZORPAY_KEY_SECRET = 'nope';
  const c = await newPrepaidOrder('C');
  const started = await startPayment({ ...c, razorpayOrderId: null }, { customerName: 'E2E', phone: '9847012345' });
  o = await read(c.id);
  check('Razorpay unreachable/rejecting -> customer told, order cancelled, hold released',
    !started.ok && o.status === 'CANCELLED' && (await stock()).reserved === afterConfirm.reserved, { started, o });

  // --- Unknown order ---
  r = await send('payment.captured', { id: 'pay_ghost', order_id: 'order_ghost', amount: 100, currency: 'INR' });
  check('payment for unknown order acknowledged (no retry storm)', r.status === 200 && r.json?.ignored === 'unknown order', r);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
