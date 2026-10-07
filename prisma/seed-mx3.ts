import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgPoolConfig } from '../src/lib/pg-config';
import { PrismaClient, Segment } from '../src/generated/prisma/client';

/**
 * Backfills real data supplied by the client on 9 August 2026: a trade
 * licence, two FSSAI Basic Registrations, a GST registration, and 28
 * product-label photographs. Full citations and reasoning are in
 * DECISIONS.md under "Open questions blocking real catalogue data" — this
 * script only encodes what that document already justifies.
 *
 * Idempotent: safe to re-run. Every write is a create-if-missing check
 * keyed on a natural unique field (gstin, slug, or sku), not a wipe-and-reseed.
 */

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  //
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg(pgPoolConfig(connectionString)) });

// ---------- Entity: the real seller of record ----------
// GST REG-06 certificate, GSTIN 32DCVPK7871P1ZI, issued 15/06/2026.
// Resolves open question 6 — see DECISIONS.md.
async function backfillSellerEntity() {
  const existing = await prisma.entity.findFirst({
    where: { gstin: '32DCVPK7871P1ZI' },
  });
  if (existing) {
    console.log('Seller entity already backfilled, skipping.');
    return;
  }

  await prisma.entity.create({
    data: {
      legalName: 'Bright Blue Trading Corporation',
      abbr: 'BBTC',
      role: 'Seller of record (proprietorship — Faisal Vathyedath Kunjimuhammed)',
      address: '66/927 Pappurath, Krishnaswamy Road, Pullepady',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682035',
      gstin: '32DCVPK7871P1ZI',
      isSeller: true,
    },
  });
  console.log('Seeded seller entity: Bright Blue Trading Corporation.');
}

// ---------- MX-3: the real 24-fragrance catalogue ----------
// Sizes and prices from three photographed price tags (batch 10075, MFG
// 18/7/2026): 225 ml ₹52, 450 ml ₹104, 900 ml ₹207 — a constant ₹0.23/ml,
// confirmed uniform across fragrances by the generic (fragrance-unlabelled)
// price tags. Resolves open questions 1 and 2 — see DECISIONS.md.
const SIZES: Array<{ size: string; pricePaise: number }> = [
  { size: '225 ml', pricePaise: 5200 },
  { size: '450 ml', pricePaise: 10400 },
  { size: '900 ml', pricePaise: 20700 },
];

// The code actually printed on a photographed label, keyed by size. Where a
// fragrance was only photographed at one size, the other two sizes fall back
// to a synthesized internal SKU rather than a fabricated barcode — see
// DECISIONS.md "Real MX-3 catalogue seeded."
const FRAGRANCES: Array<{ name: string; codes: Partial<Record<'225 ml' | '450 ml' | '900 ml', string>> }> = [
  { name: 'Strawberry', codes: { '225 ml': '7860001' } },
  { name: 'Grapes', codes: { '225 ml': '7860002' } },
  { name: 'Green Apple', codes: { '225 ml': '7860003' } },
  { name: 'Orange', codes: { '225 ml': '7860004' } },
  { name: 'Green Lemon', codes: { '225 ml': '7860005' } },
  { name: 'Guava', codes: { '225 ml': '7860006' } },
  { name: 'Pineapple', codes: { '225 ml': '7860007' } },
  { name: 'Blue Berry', codes: { '225 ml': '7860008' } },
  { name: 'Litchi', codes: { '225 ml': '7860009' } },
  { name: 'Lemon', codes: { '225 ml': '7860010' } },
  { name: 'Green Mango', codes: { '225 ml': '7860011' } },
  { name: 'Pista', codes: { '225 ml': '7860012' } },
  { name: 'Green Papaya', codes: { '225 ml': '7860013' } },
  { name: 'Mango', codes: { '225 ml': '7860014' } },
  { name: 'Avocado', codes: { '225 ml': '7860015' } },
  { name: 'Mixed Fruits', codes: { '225 ml': '7860016' } },
  { name: 'Kiwi', codes: { '225 ml': 'BBTC-0148' } },
  { name: 'Peach', codes: { '225 ml': 'BBTC-0149' } },
  { name: 'Apple', codes: { '225 ml': 'BBTC-0147' } },
  { name: 'Pomegranate', codes: { '225 ml': 'BBTC-0144', '450 ml': 'BBTC-0120' } },
  { name: 'Cucumber', codes: { '225 ml': 'BBTC-0143' } },
  { name: 'Butterfly Pea', codes: { '225 ml': 'BBTC-0145' } },
  { name: 'Olive', codes: { '450 ml': 'BBTC-0122' } },
  { name: 'Passion Fruit', codes: { '225 ml': 'BBTC-0150' } },
];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function skuFor(fragrance: string, size: '225 ml' | '450 ml' | '900 ml', code: string | undefined): string {
  if (code) return code;
  const sizeTag = size.replace(' ml', 'ML');
  return `MX3-${slugify(fragrance).toUpperCase()}-${sizeTag}`;
}

async function seedMx3Catalogue() {
  const category = await prisma.category.findFirst({ where: { slug: 'dish-care' } });
  if (!category) {
    throw new Error('Expected the "dish-care" category to already be seeded (prisma/seed.ts).');
  }

  let brand = await prisma.brand.findFirst({ where: { slug: 'mx-3' } });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: 'MX-3',
        slug: 'mx-3',
        tagline: 'Mx Three Dish Wash Liquid — 24 fragrances.',
        story:
          'International Book of Records holder for the maximum number of fragrance ' +
          'variants created for a dishwashing liquid brand, awarded to Mr Faisal V.K. ' +
          'for Bright Blue Trading Corporation.',
        accentHex: '#E31E24',
        segment: Segment.DISH_CARE,
        isActive: true,
      },
    });
    console.log('Seeded brand: MX-3.');
  } else {
    console.log('Brand MX-3 already exists, skipping.');
  }

  let product = await prisma.product.findFirst({ where: { slug: 'mx-3-dish-wash-liquid' } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'MX Three Dish Wash Liquid',
        slug: 'mx-3-dish-wash-liquid',
        brandId: brand.id,
        categoryId: category.id,
        shortDesc: 'MX Three dish wash liquid, in 24 fragrances.',
        description:
          'MX Three cuts through grease twice as effectively. For tough grease, apply ' +
          'directly to a wet scrub-sponge and use on the utensil. For regular cleaning, ' +
          'dilute a teaspoonful (4 ml approx) of MX Three in a bowl of water (40 ml approx).',
        // hsnCode and gstRate deliberately left null — no document supplied a
        // confirmed HSN, and §7 says never guess it. This also means the
        // publish guard correctly blocks these from going live yet.
        hsnCode: null,
        gstRate: null,
        claims: [
          { icon: 'leaf', label: 'Eco Friendly' },
          { icon: 'droplet', label: '2x more effective on grease' },
          { icon: 'award', label: 'International Book of Records holder' },
        ],
        ingredients:
          'SLS, SLES, Salt, Water, Cocobetaine, Preservative, Perfumes, Benzalkonium Chloride.',
        usageSteps: [
          'For tough grease: apply directly to a wet scrub-sponge and use on the utensil.',
          'For regular cleaning: dilute a teaspoonful (4 ml approx) of MX Three in a bowl of water (40 ml approx).',
        ],
        isActive: false, // draft — no HSN yet, per the publish guard
        isFeatured: false,
      },
    });
    console.log('Seeded product: MX Three Dish Wash Liquid.');
  } else {
    console.log('Product MX Three Dish Wash Liquid already exists, skipping.');
  }

  let created = 0;
  let skipped = 0;
  for (const fragrance of FRAGRANCES) {
    for (const { size, pricePaise } of SIZES) {
      const sku = skuFor(fragrance.name, size as '225 ml' | '450 ml' | '900 ml', fragrance.codes[size as '225 ml' | '450 ml' | '900 ml']);

      const existingVariant = await prisma.productVariant.findUnique({ where: { sku } });
      if (existingVariant) {
        skipped += 1;
        continue;
      }

      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          variantName: fragrance.name,
          size,
          format: 'Liquid',
          mrpPaise: pricePaise,
          pricePaise,
          isActive: false, // draft, same reason as the product
        },
      });
      created += 1;
    }
  }
  console.log(`Seeded ${created} MX-3 variants (${skipped} already existed).`);
}

async function main() {
  await backfillSellerEntity();
  await seedMx3Catalogue();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
