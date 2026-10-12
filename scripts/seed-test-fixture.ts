/** Synthetic data for disposable LOCAL integration databases only. Never production seeds. */
import { db } from '../src/lib/db';
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://unset');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Use a local database with a name ending in _test.');
  const brand = await db.brand.upsert({ where: { slug: 'integration-test' }, update: {}, create: { name: 'Integration fixture', slug: 'integration-test', accentHex: '#0b1f3a', segment: 'DISH_CARE' } });
  const category = await db.category.upsert({ where: { slug: 'integration-test' }, update: {}, create: { name: 'Integration fixture', slug: 'integration-test' } });
  const product = await db.product.upsert({ where: { slug: 'integration-test' }, update: {}, create: { name: 'Synthetic test product', slug: 'integration-test', shortDesc: 'For isolated tests only', description: 'Not a product listing', claims: [], hsnCode: '3402', gstRate: 1800, brandId: brand.id, categoryId: category.id } });
  const variant = await db.productVariant.upsert({ where: { sku: 'INTEGRATION-TEST' }, update: {}, create: { productId: product.id, sku: 'INTEGRATION-TEST', size: '500 ml', pricePaise: 12900, mrpPaise: 15000, weightGrams: 550 } });
  const location = await db.location.create({ data: { name: 'Integration warehouse', address: 'Test only', pincode: '682001', handles: ['DISH_CARE'] } });
  await db.inventory.upsert({ where: { variantId_locationId: { variantId: variant.id, locationId: location.id } }, update: { quantity: 20, reserved: 0 }, create: { variantId: variant.id, locationId: location.id, quantity: 20 } });
  await db.entity.create({ data: { legalName: 'Synthetic integration seller', role: 'Test fixture', address: 'Not a real business', gstin: 'TEST-ONLY-NOT-A-GSTIN', isSeller: true } });
  for (const [key, data] of Object.entries({
    checkout_cod: { enabled: true, feePaise: 0, minOrderPaise: 0, maxOrderPaise: 10000000, pincodeAllowlist: ['682'] },
    shipping_rates: { slabs: [{ uptoGrams: 100000, pricePaise: 0 }], overflowPricePaise: 0, defaultUnitGrams: 550, serviceablePincodePrefixes: ['682'], originPincode: '682001', preferLiveRates: false, autoPushOrders: false },
  })) await db.setting.upsert({ where: { key }, update: { data }, create: { key, data } });
  console.log('Created synthetic local fixture.');
}
main().finally(() => db.$disconnect()).catch((e: unknown) => { console.error(e instanceof Error ? e.message : 'Fixture failed'); process.exitCode = 1; });
