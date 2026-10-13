/** Representative catalogue volume for a disposable local performance database. */
import { db } from '../src/lib/db';
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://unset');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Only a local _test database is allowed');
  const template = await db.product.findUniqueOrThrow({ where: { slug: 'integration-test' } });
  await db.product.update({ where: { id: template.id }, data: { isFeatured: true } });
  await db.productImage.create({ data: { productId: template.id, publicId: 'local-fixture', url: '/collection/dishwash-cutout.webp', alt: 'Synthetic performance fixture' } });
  await db.productVariant.createMany({ data: Array.from({ length: 95 }, (_, index) => ({ productId: template.id, sku: `PERF-VARIANT-${index}`, size: `${index + 1} L`, variantName: `Test variant ${index + 1}`, pricePaise: 15000 + index, mrpPaise: 20000, weightGrams: 1000 })) });
  for (let index = 0; index < 49; index++) {
    await db.product.create({ data: { name: `Synthetic catalogue ${index + 1}`, slug: `perf-product-${index + 1}`, shortDesc: 'Disposable performance fixture', description: 'Synthetic data only', claims: [], brandId: template.brandId, categoryId: template.categoryId, hsnCode: '3402', gstRate: 1800, variants: { create: Array.from({ length: 5 }, (_, size) => ({ sku: `PERF-${index}-${size}`, size: `${size + 1} L` })) } } });
  }
  console.log('Seeded 50 products, with 96 variants on the lead product. No production database used.');
}
main().finally(() => db.$disconnect()).catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Fixture failed'); process.exitCode = 1; });
