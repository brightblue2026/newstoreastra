/** Real browser checkout on the disposable database. No live payments or notifications. */
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { db } from '../src/lib/db';

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? 'postgres://unset');
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) throw new Error('Local disposable database required');
  if (process.env.RAZORPAY_KEY_SECRET || process.env.RESEND_API_KEY || process.env.MSG91_AUTH_KEY || process.env.SHIPROCKET_EMAIL) throw new Error('Real provider credentials must be absent');
  const variant = await db.productVariant.findUniqueOrThrow({ where: { sku: 'INTEGRATION-TEST' }, include: { inventory: true } });
  const quantity = variant.inventory.reduce((sum, row) => sum + row.quantity, 0);
  assert.ok(quantity > 0);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('http://localhost:3000/products/integration-test', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('button', { name: 'Add to cart', exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goto('http://localhost:3000/checkout', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Mobile number/).fill('9000000009');
    await page.getByRole('button', { name: 'Continue to delivery' }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Synthetic Checkout Customer');
    await page.getByLabel('Pincode', { exact: true }).fill('682001');
    await page.getByLabel('House, building, street', { exact: true }).fill('Isolated test address only');
    await page.getByLabel('Town or city', { exact: true }).fill('Kochi');
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.locator('input[value="COD"]').check();
    const submit = page.getByRole('button', { name: /^Place order/ });
    await expect(submit).toBeDisabled();
    await page.locator('input[name="agreeToTerms"]').check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForURL(/\/order\/BB-/, { timeout: 60_000 });
    const orderNumber = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber }, include: { items: true } });
    assert.equal(order.status, 'CONFIRMED');
    assert.equal(order.paymentMethod, 'COD');
    assert.equal(order.paymentStatus, 'PENDING');
    assert.equal(order.totalPaise, 12900);
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].quantity, 1);
    const stock = await db.inventory.findMany({ where: { variantId: variant.id } });
    assert.equal(stock.reduce((sum, row) => sum + row.quantity, 0), quantity - 1);
    const outsider = await browser.newContext();
    const locked = await outsider.newPage();
    await locked.goto(`http://localhost:3000/order/${orderNumber}`, { waitUntil: 'domcontentloaded' });
    await expect(locked.locator('main')).not.toContainText('Synthetic Checkout Customer');
    await outsider.close();
    await page.goto('http://localhost:3000/checkout', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toContainText(/cart is empty/i);
    assert.deepEqual(errors, []);
    console.log('PASS: product → cart → delivery → COD → affirmative consent → confirmation; server totals, stock, unpaid COD status, order privacy and cleared cart.');
  } finally { await context.close(); await browser.close(); }
}
main().finally(() => db.$disconnect()).catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Customer journey failed'); process.exitCode = 1; });
