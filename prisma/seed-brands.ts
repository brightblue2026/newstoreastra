import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Segment } from '../src/generated/prisma/client';

/**
 * The other six houses. Names, segments and accent colours are all real —
 * confirmed by the client's own frontend brief (`brightblue-cleancult-
 * frontend-spec.md` §Tokens and §Part 5) and the master brief's brand list
 * (§3/§11), not invented for this seed. No products or licences are seeded
 * here — only what the storefront needs to render brand shells (pills, the
 * mega-menu, the "seven houses" grid) instead of showing MX-3 alone.
 *
 * Idempotent: create-if-missing by slug, safe to re-run.
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

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const BRANDS: Array<{
  name: string;
  slug: string;
  segment: Segment;
  accentHex: string;
  sortOrder: number;
}> = [
  { name: 'Rafasi', slug: 'rafasi', segment: Segment.FABRIC_CARE, accentHex: '#7C5CD6', sortOrder: 1 },
  { name: 'Landfloro', slug: 'landfloro', segment: Segment.HOME_CARE, accentHex: '#14A38B', sortOrder: 2 },
  { name: 'Fairoze', slug: 'fairoze', segment: Segment.PERSONAL_CARE, accentHex: '#E8617A', sortOrder: 3 },
  { name: 'ANSAF', slug: 'ansaf', segment: Segment.CAR_CARE, accentHex: '#F0A020', sortOrder: 4 },
  { name: 'Ilfa Valley', slug: 'ilfa-valley', segment: Segment.BEVERAGE, accentHex: '#B4552A', sortOrder: 5 },
  { name: 'Kenzaniya', slug: 'kenzaniya', segment: Segment.FOOD, accentHex: '#2F7D3A', sortOrder: 6 },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const brand of BRANDS) {
    const existing = await prisma.brand.findFirst({ where: { slug: brand.slug } });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.brand.create({ data: { ...brand, isActive: true } });
    created += 1;
  }

  console.log(`Seeded ${created} brands (${skipped} already existed).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
