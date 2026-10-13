import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgPoolConfig } from '../src/lib/pg-config';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * The rest of the catalogue, from the client's brochure brief supplied on
 * 13 October 2026 (the 16-page company brochure, the 4-page MX-3 brochure and
 * the 2-page mini brochure, transcribed by the client). See DECISIONS.md.
 *
 * Everything here is a draft:
 *   - products are created inactive, so nothing appears in the shop;
 *   - prices are null — the brochures print none, and a null price is "Price
 *     on request", never a placeholder;
 *   - HSN, GST rate, ingredients, food labels and photos are left empty, which
 *     is exactly what the publish guard then asks the admin for.
 *
 * Names, sizes, fragrances and claims are the brochures' own. A product whose
 * sizes no brochure states is created with no variants rather than a guess.
 *
 * Idempotent: create-if-missing by product slug and variant SKU.
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

interface ProductDef {
  brand: string; // Brand.slug
  category: string; // Category.slug
  name: string;
  slug: string;
  /** Leading part of every SKU for this product, e.g. "KNZ-JAMUN-HONEY". */
  sku: string;
  shortDesc: string;
  description: string;
  claims: string[];
  isFoodProduct?: boolean;
  isCosmetic?: boolean;
  /** Fragrances or grades. Omitted when size is the only choice. */
  variantNames?: string[];
  /** "Top Load" / "Front Load". Omitted when there is one formulation. */
  formats?: string[];
  /** Empty when no brochure states the pack sizes. */
  sizes: string[];
}

function code(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------- Home, fabric, personal and car care ----------

const FOUR_FRAGRANCES = ['Jasmin', 'Rose', 'Lavender', 'Sandlewood']; // spelt as on the label

const CARE: ProductDef[] = [
  {
    brand: 'rafasi',
    category: 'fabric-care',
    name: 'Cloth Wash Liquid',
    slug: 'rafasi-cloth-wash-liquid',
    sku: 'RAF',
    shortDesc: 'Rafasi cloth wash liquid for front load and top load machines, in 10 fragrances.',
    description:
      'Deep clean, fresh fragrance, bright colours, gentle on fabric and skin. Front Load: a ' +
      'low-suds formula for superior machine care, suitable for HE machines. Top Load: ' +
      'powerful cleaning and stain removal, even in hard water.',
    claims: [
      'Deep Clean',
      'Powered by Nature',
      'Brightens Colors',
      'Long Lasting Fragrance',
      'Gentle on Fabric & Skin',
    ],
    // The 16-page brochure: ten fragrances, 2 / 3 / 5 L. The mini brochure says
    // 2 / 5 L and four fragrances per machine type without naming them.
    variantNames: [
      'Lavender',
      'Jasmine',
      'Floral Fresh',
      'Orange',
      'Green Lemon',
      'Pineapple',
      'Litchi',
      'Blue Berry',
      'Strawberry',
      'Mixed Fruits',
    ],
    formats: ['Top Load', 'Front Load'],
    sizes: ['2 L', '3 L', '5 L'],
  },
  {
    brand: 'landfloro',
    category: 'home-care',
    name: 'Floor Cleaner',
    slug: 'landfloro-floor-cleaner',
    sku: 'LFL',
    shortDesc: 'Landfloro floor cleaner. Superior cleaning, lasting freshness.',
    description:
      'A thicker and stronger formula for a deeper clean. Superior cleaning formula that ' +
      'removes tough stains and leaves a long lasting freshness. Safe on all surfaces.',
    claims: [
      'Superior Cleaning Formula',
      'Removes Tough Stains',
      'Long Lasting Freshness',
      'Safe on All Surfaces',
      'Pleasant Fragrance',
    ],
    variantNames: ['Rose', 'Butterfly Pea', 'Lavender'],
    sizes: ['450 ml', '250 ml'],
  },
  {
    brand: 'fairoze',
    category: 'personal-care',
    name: 'Hand Wash',
    slug: 'fairoze-hand-wash',
    sku: 'FRZ-HW',
    shortDesc: 'Fairoze hand wash with added moisturizer, in four fragrances.',
    description:
      'Soft and refreshing hand wash that fights germs and eliminates odour, with added ' +
      'moisturizer. Enriched with natural extracts and skin-loving ingredients. Made in India.',
    claims: ['Fights Germs', 'Eliminates Odour', 'Added Moisturizer', 'Enriched with Natural Extracts'],
    isCosmetic: true,
    variantNames: FOUR_FRAGRANCES,
    sizes: ['300 ml'],
  },
  {
    brand: 'fairoze',
    category: 'personal-care',
    name: 'Body Wash',
    slug: 'fairoze-body-wash',
    sku: 'FRZ-BW',
    shortDesc: 'Fairoze body wash. Refresh, cleanse, nourish. In four fragrances.',
    description:
      'Body wash that cleanses, nourishes and protects. Enriched with natural extracts and ' +
      'skin-loving ingredients, Fairoze keeps your skin soft, healthy and beautifully fresh ' +
      'every day. Made in India.',
    claims: ['Fights Germs', 'Eliminates Odour', 'Added Moisturizer', 'Enriched with Natural Extracts'],
    isCosmetic: true,
    variantNames: FOUR_FRAGRANCES,
    sizes: ['1 L', '500 ml', '250 ml'],
  },
  {
    brand: 'ansaf',
    category: 'car-care',
    name: 'Car Wash',
    slug: 'ansaf-car-wash',
    sku: 'ANS-CW',
    shortDesc: 'ANSAF car wash. Clean and shine.',
    description:
      'A clean-rinsing foaming formula. Powerful cleaners lift away dirt and road grime. ' +
      'Tough on dirt, gentle on paint: safe for paint, metal, glass and plastic.',
    claims: [
      'Rich Foaming Action',
      'Removes Dirt & Grime',
      'Safe for All Surfaces',
      'Brilliant Shine',
      'Easy to Use',
    ],
    sizes: ['500 ml', '250 ml'],
  },
  {
    brand: 'ansaf',
    category: 'car-care',
    name: 'Foam Wash',
    slug: 'ansaf-foam-wash',
    sku: 'ANS-FW',
    shortDesc: 'ANSAF car foam wash. Deep cleaning foam power.',
    description:
      'A clean-rinsing foaming formula. Powerful cleaners lift away dirt and road grime. ' +
      'Rich foaming action deep cleans every inch and restores the original gloss.',
    claims: [
      'Rich Foaming Action',
      'Removes Dirt & Grime',
      'Safe for All Surfaces',
      'Brilliant Shine',
      'Easy to Use',
    ],
    sizes: ['500 ml', '250 ml'],
  },
];

// ---------- Ilfa Valley tea ----------

const TEA: ProductDef[] = [
  {
    brand: 'ilfa-valley',
    category: 'beverage',
    name: 'Ilfa Valley Tea',
    slug: 'ilfa-valley-tea',
    sku: 'ILF-TEA',
    shortDesc: 'Pure nature, perfect tea. Finest leaves, rich aroma, refreshing taste.',
    description:
      '100% pure and natural. Finest tea leaves, carefully selected, for a rich aroma and a ' +
      'refreshing taste. In five teas: Supreme, Premium, Classic, Gold and Royal.',
    claims: ['Naturally Nourishing', 'Rich Aroma', 'Refreshing Taste', 'Premium Quality'],
    isFoodProduct: true,
    variantNames: ['Supreme', 'Premium', 'Classic', 'Gold', 'Royal'],
    sizes: ['1 kg', '500 g', '250 g', '100 g'],
  },
];

// ---------- Kenzaniya foods ----------
// One product per food, because ingredients, allergens and the FSSAI label
// differ between them. Size is the only choice within a product.

function kenzaniya(
  items: Array<{ name: string; shortDesc?: string; sizes: string[] }>,
  shared: { shortDesc: (name: string) => string; description: string; claims: string[] },
): ProductDef[] {
  return items.map((item) => ({
    brand: 'kenzaniya',
    category: 'food',
    name: item.name,
    slug: `kenzaniya-${code(item.name).toLowerCase()}`,
    sku: `KNZ-${code(item.name)}`,
    shortDesc: item.shortDesc ?? shared.shortDesc(item.name),
    description: shared.description,
    claims: shared.claims,
    isFoodProduct: true,
    sizes: item.sizes,
  }));
}

const HONEY_SIZES = ['500 g', '250 g', '100 g'];
const HONEY = kenzaniya(
  [
    { name: 'Jamun Honey', shortDesc: 'A natural blend of pure Jamun honey.', sizes: HONEY_SIZES },
    { name: 'Multi Flora Honey', shortDesc: 'A natural blend of multi-floral honey.', sizes: HONEY_SIZES },
    { name: 'Wild Flower Honey', shortDesc: 'A natural blend of pure wildflower honey.', sizes: HONEY_SIZES },
    { name: 'Tulsi Honey', shortDesc: 'A natural blend of Tulsi and pure honey.', sizes: HONEY_SIZES },
    { name: 'Multi Honey', shortDesc: 'A natural blend of pure honey.', sizes: ['250 g', '100 g'] },
    { name: 'Premium Honey', shortDesc: 'Kenzaniya premium honey.', sizes: ['250 g', '100 g'] },
    // No brochure gives a size for this one.
    { name: 'Skinny Honey', shortDesc: 'A natural blend of pure honey.', sizes: [] },
  ],
  {
    shortDesc: (name) => `Kenzaniya ${name}.`,
    description:
      "Kenzaniya's premium honey range: nature's goodness in every drop. Natural and pure, " +
      'with no added preservatives.',
    claims: [
      '100% Natural',
      'Immunity Booster',
      'Rich in Antioxidants',
      'No Added Preservatives',
      'Natural Energy',
    ],
  },
);

const STAPLE_CLAIMS = ['100% Natural', 'Pure & Authentic', 'Rich in Nutrients', 'Trusted Quality'];
const STAPLES: ProductDef[] = [
  ...kenzaniya(
    [{ name: 'Marayoor Sharkara', shortDesc: 'Marayoor jaggery. Pure, natural, traditional.', sizes: ['1 kg', '500 g', '250 g'] }],
    {
      shortDesc: (name) => name,
      description:
        'Made from the finest sugarcane juice, naturally processed to retain its purity, ' +
        'taste and minerals.',
      claims: ['Natural Goodness', 'Rich in Minerals', 'Traditional Taste'],
    },
  ),
  ...kenzaniya(
    [{ name: 'Premium Ghee', shortDesc: 'Pure, authentic, nourishing ghee.', sizes: ['500 g', '250 g', '100 g'] }],
    {
      shortDesc: (name) => name,
      description:
        'Made from fresh cream using traditional methods for rich aroma, great taste and ' +
        'natural nutrition.',
      claims: STAPLE_CLAIMS,
    },
  ),
  ...kenzaniya(
    [
      { name: 'Himalayan Pink Salt', shortDesc: 'Natural, pure and unrefined pink salt.', sizes: ['1 kg', '500 g'] },
      { name: 'Brown Sugar', shortDesc: 'Pure and unrefined brown sugar.', sizes: ['1 kg', '500 g'] },
      { name: 'Basmati Rice', shortDesc: 'Premium quality basmati rice.', sizes: ['2 kg', '1 kg', '500 g'] },
      { name: 'Jeerakasala Rice', shortDesc: 'Premium quality jeerakasala rice.', sizes: ['2 kg', '1 kg', '500 g'] },
    ],
    {
      shortDesc: (name) => name,
      description:
        "Original, pure and natural: nature's goodness in every product. Naturally processed " +
        'and hygienically packed.',
      claims: STAPLE_CLAIMS,
    },
  ),
];

const SPICE_SIZES = ['250 g', '100 g', '50 g'];
const SPICES = kenzaniya(
  [
    { name: 'Cinnamon', sizes: SPICE_SIZES },
    { name: 'Cloves', sizes: SPICE_SIZES },
    { name: 'Cardamom', sizes: SPICE_SIZES },
    { name: 'Black Pepper', sizes: SPICE_SIZES },
    { name: 'Dry Ginger', sizes: SPICE_SIZES },
    // The mini brochure gives sizes for the five above only.
    { name: 'Fennel Seeds', sizes: [] },
    { name: 'Fenugreek', sizes: [] },
    { name: 'Mustard Seeds', sizes: [] },
    { name: 'Red Chilli', sizes: [] },
    { name: 'Turmeric Powder', sizes: [] },
  ],
  {
    shortDesc: (name) => `Kenzaniya Kerala spices: ${name}.`,
    description:
      'Kerala spices of the finest quality. Rich aroma, pure goodness. Carefully selected ' +
      'best-grade spices, hygienically packed for freshness.',
    claims: ['100% Natural', 'Rich Aroma', 'Pure & Clean', 'Premium Quality'],
  },
);

const NUT_SIZES = ['1 kg', '500 g', '250 g', '100 g'];
const NUTS = kenzaniya(
  [
    'Almonds',
    'Almonds Salt',
    'Cashew',
    'Skin Cashew',
    'Walnut',
    'Peanut',
    'Pepper Peanut',
    'Raisins',
    'Black Raisins',
  ].map((name) => ({ name, sizes: NUT_SIZES })),
  {
    shortDesc: (name) => `Kenzaniya nuts and dry fruits: ${name}.`,
    description:
      'Goodness in every bite. Carefully selected, naturally delicious and rich in ' +
      'nutrition. Perfect for snacking, cooking and gifting.',
    claims: [
      '100% Natural',
      'Rich in Protein',
      'No Added Preservatives',
      'Heart Friendly',
      'Energy Booster',
    ],
  },
);

const SEED_SIZES = ['500 g', '250 g', '100 g'];
const SEEDS = kenzaniya(
  [
    'Chia Seed',
    'Pumpkin Seeds',
    'Flax Seed',
    'Sunflower Seed',
    'Multi Mix Seeds',
    'Trail Mix Seeds',
    'Multi Sweet Seed Mix',
  ].map((name) => ({ name, sizes: SEED_SIZES })),
  {
    shortDesc: (name) => `Kenzaniya seeds: ${name}.`,
    description: 'Pure by nature, perfect for you. Plant based and rich in nutrients.',
    claims: [
      '100% Natural',
      'Plant Based',
      'Rich in Nutrients',
      'Boosts Immunity',
      'Heart Friendly',
      'Aids Digestion',
    ],
  },
);

const PICKLE_SIZES = ['1 kg', '500 g', '250 g', '100 g'];
const PICKLES = kenzaniya(
  [
    'Natural Garlic Pickle',
    'Natural Lemon Pickle',
    'Green Mango Pickle',
    'Green Kanni Manga Pickle',
    'Original Flavour Pickle',
  ].map((name) => ({ name, sizes: PICKLE_SIZES })),
  {
    shortDesc: (name) => `Kenzaniya ${name}, premium range.`,
    description:
      'Made with traditional recipes and the finest ingredients. No artificial colors, no ' +
      'preservatives, 100% authentic.',
    claims: ['100% Natural', 'Handmade', 'No Preservatives', 'No Artificial Colors', 'Authentic Taste'],
  },
);

const PRODUCTS: ProductDef[] = [
  ...CARE,
  ...TEA,
  ...HONEY,
  ...STAPLES,
  ...SPICES,
  ...NUTS,
  ...SEEDS,
  ...PICKLES,
];

interface VariantRow {
  sku: string;
  variantName: string | null;
  format: string | null;
  size: string;
}

function variantsOf(def: ProductDef): VariantRow[] {
  const rows: VariantRow[] = [];
  for (const format of def.formats ?? [null]) {
    for (const variantName of def.variantNames ?? [null]) {
      for (const size of def.sizes) {
        const parts = [def.sku, format, variantName, size.replace(' ', '')].filter(
          (part): part is string => Boolean(part),
        );
        rows.push({ sku: parts.map(code).join('-'), variantName, format, size });
      }
    }
  }
  return rows;
}

async function seedProducts() {
  const allSkus = PRODUCTS.flatMap((def) => variantsOf(def).map((row) => row.sku));
  const repeated = allSkus.find((sku, index) => allSkus.indexOf(sku) !== index);
  if (repeated) throw new Error(`Two variants would share the SKU ${repeated}.`);

  let productsCreated = 0;
  let variantsCreated = 0;
  let variantsSkipped = 0;

  for (const [index, def] of PRODUCTS.entries()) {
    const brand = await prisma.brand.findFirst({ where: { slug: def.brand } });
    const category = await prisma.category.findFirst({ where: { slug: def.category } });
    if (!brand || !category) {
      throw new Error(`Expected brand "${def.brand}" and category "${def.category}" to exist.`);
    }

    let product = await prisma.product.findFirst({ where: { slug: def.slug } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          name: def.name,
          slug: def.slug,
          brandId: brand.id,
          categoryId: category.id,
          shortDesc: def.shortDesc,
          description: def.description,
          // The icon half is stored and never shown — see quick-add/guided.ts.
          claims: def.claims.map((label) => ({ icon: '', label })),
          isFoodProduct: def.isFoodProduct ?? false,
          isCosmetic: def.isCosmetic ?? false,
          sortOrder: index,
          isActive: false, // draft until the admin adds a photo, HSN, GST and any label
        },
      });
      productsCreated += 1;
    }

    for (const row of variantsOf(def)) {
      const existing = await prisma.productVariant.findUnique({ where: { sku: row.sku } });
      if (existing) {
        variantsSkipped += 1;
        continue;
      }
      // Active under a draft product, as the admin's own "Add a product" form
      // makes them: publishing the product is then the one remaining step.
      await prisma.productVariant.create({
        data: { productId: product.id, ...row, isActive: true },
      });
      variantsCreated += 1;
    }
  }

  console.log(
    `Products: ${productsCreated} created of ${PRODUCTS.length}. ` +
      `Variants: ${variantsCreated} created, ${variantsSkipped} already existed.`,
  );
}

// ---------- MX-3: the 3 litre can ----------
// "Dish Wash 3 LTR (24 Fragrance Available)" in the mini brochure. Added to the
// existing product for each fragrance it already has. No price is printed, so
// none is set; inactive like the bottle sizes beside it.
async function seedMx3Cans() {
  const product = await prisma.product.findFirst({ where: { slug: 'mx-3-dish-wash-liquid' } });
  if (!product) {
    console.log('MX-3 product not found, skipping the 3 L cans. Run prisma/seed-mx3.ts first.');
    return;
  }

  const fragrances = await prisma.productVariant.findMany({
    where: { productId: product.id, variantName: { not: null } },
    distinct: ['variantName'],
    select: { variantName: true },
    orderBy: { variantName: 'asc' },
  });

  let created = 0;
  for (const { variantName } of fragrances) {
    const sku = `MX3-${code(variantName!)}-3L`;
    if (await prisma.productVariant.findUnique({ where: { sku } })) continue;
    await prisma.productVariant.create({
      data: { productId: product.id, sku, variantName, size: '3 L', format: 'Liquid', isActive: false },
    });
    created += 1;
  }
  console.log(`MX-3 3 L cans: ${created} created of ${fragrances.length} fragrances.`);
}

async function main() {
  await seedProducts();
  await seedMx3Cans();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
