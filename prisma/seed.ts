import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole, Segment } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/password';

// `prisma db seed` already loads .env via prisma.config.ts, but this script can
// also run standalone (`node prisma/seed.ts`), so load it again defensively.
try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env present, or already loaded.
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Dev-only login. Never reused in production — rotate every seeded credential
 * before any handover. See PROGRESS.md and the security-first project note.
 */
const DEV_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'ChangeMe!Dev1';

// Master brief §11. Real addresses, no GSTIN — open question 6 (duplicate GSTIN
// across two entities) is unresolved, so `gstin` and `isSeller` are left unset
// rather than guessed.
const LOCATIONS: Array<{
  name: string;
  address: string;
  pincode: string;
  handles: Segment[];
}> = [
  {
    name: 'BBTC Production Controlling Section Office',
    address: '175 High Holborn Street, Rosewood London, Greater London, UK',
    pincode: 'WC1V 7AA',
    handles: [],
  },
  {
    name: 'BBTC Head Office',
    address: '66/927 Pappurath Building, Krishnaswami Road, Pullepady, Ernakulam, Kerala',
    pincode: '682035',
    handles: [],
  },
  {
    name: 'BBTC Ernakulam District Office',
    address: 'C-72/1112 Freedom Road, Kaloor PO, Cochin, Ernakulam',
    pincode: '682017',
    handles: [],
  },
  {
    name: 'BBTC Machineries',
    address: '15/66 KVSN Compound, Chengaram, Palakkad',
    pincode: '678681',
    handles: [Segment.HOME_CARE, Segment.DISH_CARE, Segment.FABRIC_CARE, Segment.CAR_CARE],
  },
  {
    name: 'BBTC Foods & Beverages',
    address:
      '14/428/C Al-Badhar Complex, Praniyad, opp. Praniyad Juma Masjid, Mathilakam, Thrissur',
    pincode: '680685',
    handles: [Segment.FOOD, Segment.BEVERAGE],
  },
  {
    name: 'BBTC Foods Products',
    address: '14/117/A Al-Badhar Complex, Praniyad, Mathilakam, Thrissur',
    pincode: '680685',
    handles: [Segment.FOOD],
  },
  {
    name: 'BBTC Food Packing Centre',
    address: '4/410G Korad, Ozhur PO, Malappuram',
    pincode: '676307',
    handles: [Segment.FOOD],
  },
  {
    name: 'BBTC Kasargod District Office',
    address: '28/5-A Kadavath, Thalangara PO, Kasaragod',
    pincode: '671122',
    handles: [],
  },
  {
    name: 'Bright Blue Manufacturing Pvt Ltd',
    address: '15/67 KVSN Compound, Chengaram, Palakkad',
    pincode: '678681',
    handles: [
      Segment.HOME_CARE,
      Segment.DISH_CARE,
      Segment.FABRIC_CARE,
      Segment.CAR_CARE,
      Segment.PERSONAL_CARE,
    ],
  },
  {
    name: 'Bright Blue Marketing Associates LLP',
    address: '28/8 Kadavath, Thalangara PO, Kasaragod',
    pincode: '671122',
    handles: [],
  },
  {
    name: 'Bright Blue Chemicals LLP',
    address: '7/757 PH Building, Kozhinjamparambu, Kuzhalmannam, Palakkad',
    pincode: '678702',
    handles: [Segment.HOME_CARE, Segment.DISH_CARE],
  },
];

// Only the incorporated entities — office/district addresses above are not
// separate legal entities. `gstin` and `isSeller` stay unset; open question 6
// blocks which entity (if either) can appear on an invoice.
const ENTITIES: Array<{
  legalName: string;
  abbr: string;
  role: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}> = [
  {
    legalName: 'Bright Blue Manufacturing Pvt Ltd',
    abbr: 'BBM',
    role: 'Manufacturing',
    address: '15/67 KVSN Compound, Chengaram, Palakkad',
    city: 'Palakkad',
    state: 'Kerala',
    pincode: '678681',
  },
  {
    legalName: 'Bright Blue Marketing Associates LLP',
    abbr: 'BBMA',
    role: 'Marketing & Sales',
    address: '28/8 Kadavath, Thalangara PO, Kasaragod',
    city: 'Kasaragod',
    state: 'Kerala',
    pincode: '671122',
  },
  {
    legalName: 'Bright Blue Chemicals LLP',
    abbr: 'BBC',
    role: 'Chemicals manufacturing',
    address: '7/757 PH Building, Kozhinjamparambu, Kuzhalmannam, Palakkad',
    city: 'Palakkad',
    state: 'Kerala',
    pincode: '678702',
  },
];

// One top-level category per catalogue segment. No brands, fragrances or
// prices — §7 forbids seeding placeholder prices, and the exact catalogue
// (open questions 1-3) is still unresolved.
const CATEGORY_SEGMENTS: Segment[] = [
  Segment.HOME_CARE,
  Segment.DISH_CARE,
  Segment.FABRIC_CARE,
  Segment.CAR_CARE,
  Segment.PERSONAL_CARE,
  Segment.FOOD,
  Segment.BEVERAGE,
];

function segmentLabel(segment: Segment): string {
  return segment
    .toLowerCase()
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

async function seedLocations() {
  const existing = await prisma.location.count();
  if (existing > 0) {
    console.log(`Locations already seeded (${existing}), skipping.`);
    return;
  }
  await prisma.location.createMany({ data: LOCATIONS });
  console.log(`Seeded ${LOCATIONS.length} locations.`);
}

async function seedEntities() {
  const existing = await prisma.entity.count();
  if (existing > 0) {
    console.log(`Entities already seeded (${existing}), skipping.`);
    return;
  }
  await prisma.entity.createMany({ data: ENTITIES });
  console.log(`Seeded ${ENTITIES.length} entities.`);
}

async function seedCategories() {
  const existing = await prisma.category.count();
  if (existing > 0) {
    console.log(`Categories already seeded (${existing}), skipping.`);
    return;
  }
  for (const [index, segment] of CATEGORY_SEGMENTS.entries()) {
    const label = segmentLabel(segment);
    await prisma.category.create({
      data: {
        name: label,
        slug: segment.toLowerCase().replace(/_/g, '-'),
        sortOrder: index,
      },
    });
  }
  console.log(`Seeded ${CATEGORY_SEGMENTS.length} top-level categories.`);
}

async function seedUsers() {
  const accounts: Array<{ name: string; email: string; role: UserRole }> = [
    { name: 'Dev Staff', email: 'staff@dev.bbtc.local', role: UserRole.STAFF },
    { name: 'Dev Manager', email: 'manager@dev.bbtc.local', role: UserRole.MANAGER },
    { name: 'Dev Admin', email: 'admin@dev.bbtc.local', role: UserRole.ADMIN },
  ];

  const passwordHash = await hashPassword(DEV_PASSWORD);

  for (const account of accounts) {
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: { ...account, passwordHash },
    });
  }
  console.log(`Seeded ${accounts.length} dev users (password: ${DEV_PASSWORD}).`);
}

async function main() {
  await seedLocations();
  await seedEntities();
  await seedCategories();
  await seedUsers();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
