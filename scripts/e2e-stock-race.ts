/*
  Concurrency check for checkout stock: many customers ordering the same
  variant at the same instant must never be sold more than is on the shelf.

    pnpm e2e:stock-race

  Places N simultaneous COD orders asking for more units than exist, then
  checks that exactly as many succeed as the stock allows, that none went
  negative, and that order and invoice numbers stayed unique. Everything it
  creates is deleted and every inventory row is put back exactly.

  Regression guard for a real oversell: before `inventoryFor` locked its rows,
  12 orders of 2 against 20 units all succeeded and left a row at −4
  (28 September 2026, against Supabase — it reproduces on any Postgres).

  Needs COD enabled (Admin → Settings) and one priced, active variant with
  stock. Refuses a non-local database unless E2E_ALLOW_DB_HOST names it
  exactly — for a pre-launch database with no real orders only.
*/

import { db } from '@/lib/db';
import { placeOrder } from '@/lib/orders';

const QTY = 2;
let failures = 0;
const created: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

function orderFor(variantId: string, i: number) {
  return placeOrder({
    lines: [{ kind: 'VARIANT', id: variantId, quantity: QTY }],
    phone: '9847012345',
    email: `race${i}@example.com`,
    paymentMethod: 'COD',
    shipping: {
      fullName: `Stock Race ${i}`,
      phone: '9847012345',
      line1: '12 Test Road',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    notes: 'e2e stock race',
  }).catch((error: Error) => ({ ok: false as const, error: `THREW: ${error.message}` }));
}

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://unset').hostname;
  const allowedRemote = process.env.E2E_ALLOW_DB_HOST?.trim();
  if (!['localhost', '127.0.0.1', '::1'].includes(dbHost) && dbHost !== allowedRemote) {
    throw new Error(`Refusing to run: DATABASE_URL points at ${dbHost}, not a local database.`);
  }

  const [candidate] = await db.$queryRaw<{ id: string; available: bigint }[]>`
    SELECT v.id, sum(i.quantity - i.reserved) AS available
    FROM "ProductVariant" v
    JOIN "Product" p ON p.id = v."productId" AND p."isActive"
    JOIN "Inventory" i ON i."variantId" = v.id
    JOIN "Location" l ON l.id = i."locationId" AND l."isActive"
    WHERE v."pricePaise" IS NOT NULL AND v."isActive"
    GROUP BY v.id HAVING sum(i.quantity - i.reserved) BETWEEN 4 AND 40
    LIMIT 1
  `;
  if (!candidate) throw new Error('No active, priced variant with 4–40 units in stock.');

  const variantId = candidate.id;
  const available = Number(candidate.available);
  const snapshot = await db.inventory.findMany({
    where: { variantId },
    select: { id: true, quantity: true, reserved: true },
  });

  try {
    // Ask for two orders' worth more than exists.
    const attempts = Math.floor(available / QTY) + 2;
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: attempts }, (_, i) => orderFor(variantId, i)));
    const placed = results.flatMap((r) => (r.ok ? [r.order] : []));
    placed.forEach((order) => created.push(order.id));
    console.log(
      `${attempts} simultaneous orders against ${available} units in ${Date.now() - started}ms: ` +
        `${placed.length} placed, ${attempts - placed.length} refused`,
    );

    const crashed = results.filter((r) => !r.ok && r.error.startsWith('THREW'));
    check('no order crashed', crashed.length === 0, crashed);
    const refusedForStock = results.filter((r) => !r.ok && /in stock/.test(r.error)).length;
    check('refusals are for stock, not configuration', refusedForStock === attempts - placed.length, results);
    check('never oversells', placed.length * QTY <= available, { placed: placed.length, available });
    check('sells exactly what exists', placed.length === Math.floor(available / QTY), placed.length);

    const numbers = placed.map((o) => o.orderNumber);
    check('order numbers unique', new Set(numbers).size === numbers.length, numbers);
    const invoices = (
      await db.order.findMany({ where: { id: { in: created } }, select: { invoiceNumber: true } })
    ).flatMap((o) => (o.invoiceNumber ? [o.invoiceNumber] : []));
    check('invoice numbers unique', new Set(invoices).size === invoices.length, invoices);

    const after = await db.inventory.findMany({ where: { variantId } });
    check('no row below zero', after.every((r) => r.quantity >= 0 && r.reserved >= 0), after);
  } finally {
    await db.orderItem.deleteMany({ where: { orderId: { in: created } } });
    await db.order.deleteMany({ where: { id: { in: created } } });
    for (const row of snapshot) {
      await db.inventory.update({
        where: { id: row.id },
        data: { quantity: row.quantity, reserved: row.reserved },
      });
    }
    const restored = await db.inventory.findMany({ where: { variantId } });
    check(
      'cleanup restored every inventory row',
      snapshot.every((row) => {
        const now = restored.find((r) => r.id === row.id);
        return now?.quantity === row.quantity && now.reserved === row.reserved;
      }),
    );
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await db.$disconnect();
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
