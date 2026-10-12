/*
  End-to-end check of the courier tracking webhook against a running dev server
  and the LOCAL database.

    pnpm dev              # one terminal, with SHIPROCKET_WEBHOOK_TOKEN set in .env
    pnpm e2e:shiprocket   # another

  It places real cash-on-delivery and prepaid orders through `placeOrder`, then
  posts tracking scans at /api/webhooks/shiprocket and at
  /api/webhooks/courier-tracking (the address Shiprocket's dashboard accepts):
  missing and wrong tokens, a malformed body, an intermediate scan carrying the
  AWB, staff marking it packed, in transit, a duplicate, out for delivery, delivered, a late scan after
  delivery, an unknown order, and a scan aimed at an order nobody has paid for.
  Everything it creates is deleted and every inventory row it touched is put
  back exactly, so it can be re-run.

  Nothing leaves the machine. There is no Shiprocket sandbox — every pushed
  order lands in the real dashboard — so this process blanks the Shiprocket
  credentials before placing anything and never logs in. Pushing an order,
  assigning an AWB and printing a label are checked by hand, from the admin.
  It refuses to run against anything but a local database, because it writes
  orders and moves stock.
*/

import { db } from '@/lib/db';
import { placeOrder, transitionOrder } from '@/lib/orders';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.SHIPROCKET_WEBHOOK_TOKEN?.trim();
let VARIANT = '';
let failures = 0;
/** Every order this run creates, so cleanup can find them even after a crash. */
const created: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function newOrder(paymentMethod: 'COD' | 'RAZORPAY') {
  const placed = await placeOrder({
    lines: [{ kind: 'VARIANT', id: VARIANT, quantity: 1 }],
    phone: '9847012345',
    email: 'e2e@example.com',
    paymentMethod,
    shipping: {
      fullName: 'E2E Tester',
      phone: '9847012345',
      line1: '12 Test Road',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    notes: `e2e shiprocket ${paymentMethod}`,
  });
  if (!placed.ok) throw new Error(`placeOrder failed: ${placed.error}`);
  created.push(placed.order.id);
  return db.order.findUniqueOrThrow({
    where: { id: placed.order.id },
    select: { id: true, orderNumber: true, status: true },
  });
}

async function scan(
  body: unknown,
  { path = '/api/webhooks/shiprocket', token = TOKEN as string | null, raw = false } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-api-key': token } : {}) },
    body: raw ? String(body) : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const read = (id: string) =>
  db.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, awbNumber: true, trackingUrl: true, courierName: true },
  });

async function run() {
  const order = await newOrder('COD');
  check('cash-on-delivery order is confirmed on placing', order.status === 'CONFIRMED', order);
  const awb = `E2EAWB${Date.now()}`;

  // --- Who may call it ---
  let r = await scan({ order_id: order.orderNumber, current_status: 'SHIPPED' }, { token: null });
  check('missing token -> 401', r.status === 401, r);
  r = await scan({ order_id: order.orderNumber, current_status: 'SHIPPED' }, { token: 'not-the-token' });
  check('wrong token -> 401', r.status === 401, r);
  check('  ...order untouched', (await read(order.id)).status === 'CONFIRMED');
  r = await scan('{not json', { raw: true });
  check('malformed body -> 400', r.status === 400, r);

  // --- A scan that is not a status change still records the AWB ---
  r = await scan({ order_id: order.orderNumber, awb, courier_name: 'DTDC', current_status: 'PICKED UP' });
  let o = await read(order.id);
  check('intermediate scan is acknowledged, status unchanged', r.status === 200 && o.status === 'CONFIRMED', { r, o });
  check(
    '  ...AWB, courier and tracking link recorded',
    o.awbNumber === awb && o.courierName === 'DTDC' && (o.trackingUrl ?? '').includes(awb),
    o,
  );

  // --- The journey, found by AWB alone from here on ---
  // Staff mark the parcel packed before the courier collects it; a scan cannot
  // skip that step (`order-status.ts`).
  const packed = await transitionOrder({ orderId: order.id, to: 'PACKED', actor: 'STAFF' });
  check('staff can mark the order packed', packed.ok, packed);
  r = await scan({ awb, current_status: 'IN TRANSIT' });
  check('in transit -> SHIPPED', r.status === 200 && (await read(order.id)).status === 'SHIPPED', r);
  r = await scan({ awb, current_status: 'SHIPPED' });
  check('duplicate scan is acknowledged as already handled', r.status === 200 && r.json?.status === 'already handled', r);
  r = await scan({ awb, current_status: 'Out For Delivery' });
  check('out for delivery is accepted, order stays SHIPPED', r.status === 200 && (await read(order.id)).status === 'SHIPPED', r);
  r = await scan({ awb, current_status: 'DELIVERED' }, { path: '/api/webhooks/courier-tracking' });
  check('delivered, at the dashboard-safe address -> DELIVERED', r.status === 200 && (await read(order.id)).status === 'DELIVERED', r);
  r = await scan({ awb, current_status: 'IN TRANSIT' });
  check('late scan after delivery does not move it back', r.status === 200 && (await read(order.id)).status === 'DELIVERED', r);

  // --- What it must never do ---
  r = await scan({ order_id: 'BB-0000-99999', current_status: 'DELIVERED' });
  check('unknown order acknowledged (no retry storm)', r.status === 200 && r.json?.ignored === 'unknown order', r);

  const unpaid = await newOrder('RAZORPAY');
  check('prepaid order waits for payment', unpaid.status === 'PENDING_PAYMENT', unpaid);
  for (const current_status of ['SHIPPED', 'DELIVERED', 'CONFIRMED']) {
    r = await scan({ order_id: unpaid.orderNumber, current_status });
    o = await read(unpaid.id);
    check(`"${current_status}" scan cannot move an unpaid order`, r.status === 200 && o.status === 'PENDING_PAYMENT', { r, o });
  }
}

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(dbHost)) {
    throw new Error(`Refusing to run: DATABASE_URL points at ${dbHost}, not a local database.`);
  }
  if (!TOKEN) {
    throw new Error('Set SHIPROCKET_WEBHOOK_TOKEN, to the same value the dev server was started with.');
  }

  // No sandbox exists: a confirmed order would otherwise be pushed to the real
  // Shiprocket account from this process.
  for (const key of ['SHIPROCKET_API_EMAIL', 'SHIPROCKET_API_PASSWORD', 'SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD']) {
    process.env[key] = '';
  }

  const [candidate] = await db.$queryRaw<{ id: string }[]>`
    SELECT v.id FROM "ProductVariant" v
    JOIN "Inventory" i ON i."variantId" = v.id
    JOIN "Location" l ON l.id = i."locationId" AND l."isActive"
    WHERE v."pricePaise" IS NOT NULL
    GROUP BY v.id HAVING sum(i.quantity - i.reserved) >= 2
    LIMIT 1
  `;
  if (!candidate) throw new Error('No priced variant with at least 2 units in stock to order.');
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

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
