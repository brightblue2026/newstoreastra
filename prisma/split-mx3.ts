import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgPoolConfig } from '../src/lib/pg-config';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

/**
 * One product per MX-3 fragrance.
 *
 * MX-3 was a single product, "MX Three Dish Wash Liquid", with ninety-six
 * variants (24 fragrances x 4 sizes). On 13 October 2026 the owner asked for
 * each fragrance to be its own product, and had already made one by hand —
 * "Pineapple Fragrant Dish Wash Liquid" — which this follows for the name,
 * the short description, the usage steps and the tax details (HSN 3402, 18%).
 *
 * What it does, per fragrance:
 *   - finds or creates "<Fragrance> Fragrant Dish Wash Liquid";
 *   - moves that fragrance's variants, and their photos, into it. Variant ids
 *     and SKUs do not change, so past orders still point at the same rows;
 *   - folds a hand-made duplicate (same size, no price) into the priced
 *     variant: its photos move across and it is unpublished, never deleted.
 * Then the old single product, left with no variants, is unpublished.
 *
 * Idempotent: safe to run again. Nothing is deleted.
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

const OLD_SLUG = 'mx-3-dish-wash-liquid';

// The official 24, in the brochure's order, with the liquid colour its pack
// photographs show. `name` is the spelling the variants already carry.
const FRAGRANCES: Array<{ name: string; colour: string }> = [
  { name: 'Strawberry', colour: 'Red' },
  { name: 'Grapes', colour: 'Deep purple' },
  { name: 'Green Apple', colour: 'Green' },
  { name: 'Orange', colour: 'Orange' },
  { name: 'Green Lemon', colour: 'Green' },
  { name: 'Guava', colour: 'Green' },
  { name: 'Pineapple', colour: 'Golden yellow' },
  { name: 'Green Papaya', colour: 'Green' },
  { name: 'Blue Berry', colour: 'Blue' },
  { name: 'Green Mango', colour: 'Green' },
  { name: 'Mango', colour: 'Orange' },
  { name: 'Pista', colour: 'Light green' },
  { name: 'Avocado', colour: 'Green' },
  { name: 'Mixed Fruits', colour: 'Dark maroon' },
  { name: 'Cucumber', colour: 'Pale yellow-green' },
  { name: 'Pomegranate', colour: 'Red' },
  { name: 'Butterfly Pea', colour: 'Aqua' },
  { name: 'Olive', colour: 'Light olive green' },
  { name: 'Apple', colour: 'Red-orange' },
  { name: 'Kiwi', colour: 'Green' },
  { name: 'Peach', colour: 'Peach' },
  { name: 'Passion Fruit', colour: 'Peach' },
  { name: 'Litchi', colour: 'Clear' },
  { name: 'Lemon', colour: 'Yellow' },
];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const productName = (fragrance: string) => `${fragrance} Fragrant Dish Wash Liquid`;
const productSlug = (fragrance: string) => `${slugify(fragrance)}-fragrant-dish-wash-liquid`;

/** "900ml" and "900 ml" are the same pack. */
const sizeKey = (size: string) => size.toLowerCase().replace(/\s+/g, '');

// The owner's own wording for the Pineapple product, with the fragrance left
// open and the pineapple-only adjectives ("tropical", "golden yellow") taken
// out. The "2X" line carries the footnote the brochure prints with it.
function description(fragrance: string, colour: string): string {
  const lower = fragrance.toLowerCase();
  return [
    `MX-3 Dish Wash Liquid – ${fragrance} Fragrance`,
    '',
    `Powerful Grease Cleaning. Sparkling Dishes. Refreshing ${fragrance} Fragrance.`,
    '',
    `Make everyday dishwashing easier and more refreshing with MX-3 Dish Wash Liquid, ${fragrance} Fragrance. Designed for everyday kitchen cleaning, MX-3 combines effective grease removal, rich foaming action, and a delightful ${lower} fragrance to leave your utensils clean, fresh, and sparkling.`,
    '',
    'From everyday plates and glasses to oily cooking vessels and greasy cookware, MX-3 helps remove food residue and stubborn grease for a satisfying cleaning experience.',
    '',
    'Key Features & Benefits',
    '',
    'Powerful Grease Removal',
    'Formulated to tackle stubborn grease, oil, and food residue, helping make everyday dishwashing faster and easier.',
    '',
    'Rich Foaming Action',
    'Produces a rich lather that spreads easily across utensils, helping lift grease and food particles from surfaces.',
    '',
    '2X More Greasy Dishes*',
    'MX-3 features a 2X more greasy dishes cleaning claim, as highlighted on the product packaging, for efficient everyday dishwashing.',
    '*Vs. ordinary dish wash under standard test conditions.',
    '',
    'Sparkling Clean Utensils',
    'Helps wash away dirt and grease, leaving plates, glasses, and cookware looking clean and shiny.',
    '',
    `Refreshing ${fragrance} Fragrance`,
    `Infused with a ${lower} fragrance that makes dishwashing feel fresher and more pleasant.`,
    '',
    'Convenient Liquid Formula',
    'Easy to dispense, dilute, and apply with a sponge or dishwashing scrubber.',
    '',
    'Product Specifications',
    '',
    'Brand: MX-3 (Mx Three)',
    'Product: Dish Wash Liquid',
    `Fragrance: ${fragrance}`,
    'Net Volume: 225 ml, 450 ml and 900 ml bottles, and a 3 L can',
    `Colour: ${colour}`,
    'Product Type: Liquid Dishwashing Detergent',
    'Application: Manual Dishwashing',
    'Usage: Household Kitchen Cleaning',
    '',
    'Ideal For',
    '',
    '- Daily household dishwashing',
    '- Oily plates and greasy cookware',
    '- Stainless steel kitchen utensils',
    '- Ceramic plates and bowls',
    '- Glassware and everyday kitchen accessories',
    '- Pots, pans, and cooking vessels suitable for handwashing',
    '',
    `MX-3 Dish Wash Liquid – Tough on Grease. Fresh with ${fragrance}. Made for Everyday Cleaning.`,
    '',
    'Storage & Safety Instructions',
    '',
    '- Keep out of reach of children.',
    '- Avoid contact with eyes.',
    '- Do not ingest.',
    '- Rinse thoroughly with water in case of eye contact.',
    '- Store in a cool, dry place away from direct sunlight.',
    '- Use only for its intended dishwashing purpose.',
  ].join('\n');
}

// The brochure's five icon claims for MX-3.
const CLAIMS = [
  'Natural Ingredients',
  '2X More Greasy Dishes',
  'Tough on Grease',
  'Gentle on Hands',
  'Original Quality',
].map((label) => ({ icon: '', label }));

const USAGE_STEPS = [
  'Add a small quantity of MX-3 Dish Wash Liquid to a wet sponge or dilute it with water as required.',
  'Gently scrub plates, utensils, and cookware to remove grease and food residue.',
  'Rinse thoroughly with clean water.',
  'Allow utensils to air-dry or wipe them using a clean cloth.',
];

async function main() {
  const old = await prisma.product.findFirst({ where: { slug: OLD_SLUG } });
  if (!old) {
    console.log('No single MX-3 product here; nothing to split.');
    return;
  }

  // Audit entries need an author; the bootstrap admin is the one that exists
  // on every database this runs against.
  const author =
    (await prisma.user.findFirst({ where: { email: 'brightbluefmcg@gmail.com' } })) ??
    (await prisma.user.findFirst({ where: { role: 'ADMIN' } }));
  if (!author) throw new Error('No admin user to record the change against.');

  const audit = (action: 'create' | 'update' | 'deactivate', entityId: string, after: object) =>
    prisma.auditLog.create({
      data: {
        userId: author.id,
        action,
        entityType: 'Product',
        entityId,
        before: Prisma.JsonNull,
        after: { ...after, note: 'MX-3 split into one product per fragrance, 13 October 2026.' },
      },
    });

  let created = 0;
  let moved = 0;
  let folded = 0;

  for (const [index, fragrance] of FRAGRANCES.entries()) {
    const slug = productSlug(fragrance.name);
    let target = await prisma.product.findFirst({ where: { slug } });
    if (!target) {
      target = await prisma.product.create({
        data: {
          name: productName(fragrance.name),
          slug,
          brandId: old.brandId,
          categoryId: old.categoryId,
          shortDesc: `${fragrance.name} Fragrance, Cuts Grease, Gentle On Hands`,
          description: description(fragrance.name, fragrance.colour),
          hsnCode: '3402',
          gstRate: 1800,
          claims: CLAIMS,
          ingredients: old.ingredients,
          usageSteps: USAGE_STEPS,
          isActive: true,
          isFeatured: old.isFeatured,
          sortOrder: index,
        },
      });
      await audit('create', target.id, { name: target.name, slug });
      created += 1;
    }

    // 1. A variant filed under the wrong fragrance's product by hand — its
    //    name begins with this fragrance — comes home.
    const strays = await prisma.productVariant.findMany({
      where: {
        variantName: { startsWith: `${fragrance.name} Fragrant` },
        productId: { not: target.id },
        product: { brandId: old.brandId },
      },
      select: { id: true },
    });

    // 2. This fragrance's variants on the old single product.
    const fromOld = await prisma.productVariant.findMany({
      where: { productId: old.id, variantName: fragrance.name },
      select: { id: true },
    });

    const incoming = [...strays, ...fromOld].map((variant) => variant.id);
    if (incoming.length > 0) {
      await prisma.$transaction([
        prisma.productVariant.updateMany({
          where: { id: { in: incoming } },
          data: { productId: target.id },
        }),
        // A variant's photos belong to the product the variant is in.
        prisma.productImage.updateMany({
          where: { variantId: { in: incoming } },
          data: { productId: target.id },
        }),
      ]);
      moved += incoming.length;
    }

  }

  // Folding happens only once every variant is in its own fragrance's
  // product. Done in the same pass as the moves, a stray Peach variant still
  // sitting in the Pineapple product was folded into Pineapple's 900 ml.
  for (const fragrance of FRAGRANCES) {
    const target = await prisma.product.findFirst({ where: { slug: productSlug(fragrance.name) } });
    if (!target) continue;

    // Fold a price-less duplicate of a size into the priced one.
    const variants = await prisma.productVariant.findMany({
      where: { productId: target.id },
      orderBy: { sku: 'asc' },
      select: { id: true, size: true, pricePaise: true, isActive: true },
    });
    for (const duplicate of variants.filter((variant) => variant.pricePaise === null && variant.isActive)) {
      const keeper = variants.find(
        (variant) =>
          variant.id !== duplicate.id &&
          variant.pricePaise !== null &&
          sizeKey(variant.size) === sizeKey(duplicate.size),
      );
      if (!keeper) continue;
      await prisma.$transaction([
        prisma.productImage.updateMany({
          where: { variantId: duplicate.id },
          data: { variantId: keeper.id },
        }),
        prisma.productVariant.update({ where: { id: duplicate.id }, data: { isActive: false } }),
      ]);
      folded += 1;
    }
  }

  // The old single product has nothing left to sell.
  const remaining = await prisma.productVariant.count({ where: { productId: old.id } });
  if (remaining === 0 && (old.isActive || old.isFeatured)) {
    await prisma.product.update({
      where: { id: old.id },
      data: { isActive: false, isFeatured: false },
    });
    await audit('deactivate', old.id, { name: old.name, isActive: false });
  }

  console.log(
    `Fragrance products created: ${created}. Variants moved: ${moved}. ` +
      `Duplicates folded: ${folded}. Variants left on the old product: ${remaining}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
