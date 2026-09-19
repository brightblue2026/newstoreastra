/*
  The QA screenshot matrix.

    pnpm qa:shoot            # writes the "before" set
    pnpm qa:shoot after      # writes the "after" set

  Full-page shots of every storefront route at the six widths the `ui-polish`
  skill asks for, written to `qa/screenshots/<route>/<width>-<label>.png` so a
  fix can be shown as a before/after pair at every breakpoint.

  Three things this has to work around:

  - **Scroll reveals.** Nearly every storefront section renders at `opacity: 0`
    and only becomes visible once `whileInView` fires (see `src/components/
    Reveal.tsx`). A naive full-page shot catches most of the page still
    invisible, so each page is scrolled to the bottom in viewport-sized steps
    and back to the top before the shot is taken.
  - **Lenis smooth scrolling.** `SmoothScroll` hijacks the wheel but not
    programmatic scrolling, so stepping `window.scrollTo` still advances the
    page; the waits below give both Lenis and the reveal observer time to settle.
  - **A mostly unpublished catalogue.** Product, brand, category and combo pages
    need a real slug, and most of this catalogue has nothing published yet. The
    slugs are read from the database, and a route with nothing to show is
    skipped and reported rather than photographed as a 404.
*/

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env present, or already loaded.
}

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:3000';
const WIDTHS = [360, 390, 768, 1024, 1280, 1536] as const;
const OUT_ROOT = path.join(process.cwd(), 'qa', 'screenshots');

const label = process.argv[2] === 'after' ? 'after' : 'before';

type Route = { name: string; url: string };

/** Routes that exist regardless of what is in the catalogue. */
const STATIC_ROUTES: Route[] = [
  { name: 'home', url: '/' },
  { name: 'shop', url: '/shop' },
  { name: 'search', url: '/search?q=mx' },
  { name: 'stockists', url: '/stockists' },
  { name: 'story', url: '/story' },
];

/**
 * Dynamic routes, resolved against real rows. A page whose row does not exist
 * or is not published is left out — a 404 screenshot teaches nothing about
 * layout.
 */
async function dynamicRoutes(prisma: PrismaClient): Promise<{ routes: Route[]; skipped: string[] }> {
  const routes: Route[] = [];
  const skipped: string[] = [];

  const [product, brand, category, combo] = await Promise.all([
    prisma.product.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.brand.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.combo.findFirst({ where: { isActive: true } }),
  ]);

  if (product) routes.push({ name: 'product', url: `/products/${product.slug}` });
  else skipped.push('product — no published product');

  if (brand) routes.push({ name: 'brand', url: `/brands/${brand.slug}` });
  else skipped.push('brand — no active brand');

  if (category) routes.push({ name: 'category', url: `/categories/${category.slug}` });
  else skipped.push('category — no active category');

  if (combo) routes.push({ name: 'combo', url: `/combos/${combo.slug}` });
  else skipped.push('combo — no active combo');

  return { routes, skipped };
}

/*
  Browser-side code is written as strings, not as closures.

  `tsx` compiles this file with esbuild's `keepNames`, which rewrites every
  function into one wrapped by a `__name` helper. Playwright serialises the
  function it is handed and evaluates it inside the page, where that helper
  does not exist — so a compiled closure dies on arrival with
  "ReferenceError: __name is not defined". A string is never transformed, so it
  arrives as written. The cost is that TypeScript cannot check inside these two
  blocks; keep them short enough that it does not matter.
*/

/**
 * Walk the page so every `whileInView` reveal has fired, then return to the
 * top so the full-page shot starts where a visitor would.
 */
const REVEAL_SCRIPT = `(async () => {
  const step = window.innerHeight;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await wait(150);
  }

  window.scrollTo(0, document.body.scrollHeight);
  await wait(600);
  window.scrollTo(0, 0);
  await wait(300);
})()`;

/** Flags any element wider than the viewport — the 360px horizontal-scroll check. */
const OVERFLOW_SCRIPT = `(() => {
  const limit = document.documentElement.clientWidth;
  const offenders = [];

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width > limit + 1) {
      const id = el.id ? '#' + el.id : '';
      const cls = typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
        : '';
      offenders.push(el.tagName.toLowerCase() + id + cls + ' — ' + Math.round(rect.width) + 'px');
    }
  }

  return Array.from(new Set(offenders)).slice(0, 8);
})()`;

async function revealEverything(page: Page): Promise<void> {
  await page.evaluate(REVEAL_SCRIPT);
}

async function overflowOffenders(page: Page): Promise<string[]> {
  return (await page.evaluate(OVERFLOW_SCRIPT)) as string[];
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const { routes: dynamic, skipped } = await dynamicRoutes(prisma);
  await prisma.$disconnect();

  const routes = [...STATIC_ROUTES, ...dynamic];

  const browser = await chromium.launch();
  const overflow: string[] = [];
  let shots = 0;

  try {
    for (const route of routes) {
      await mkdir(path.join(OUT_ROOT, route.name), { recursive: true });

      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();

        const response = await page.goto(`${BASE_URL}${route.url}`, {
          waitUntil: 'networkidle',
          timeout: 60_000,
        });

        if (response && response.status() >= 400) {
          console.warn(`  ! ${route.name} @ ${width} returned HTTP ${response.status()}`);
        }

        await revealEverything(page);

        // The narrowest width is the one the no-horizontal-scroll rule is about.
        if (width === 360) {
          for (const offender of await overflowOffenders(page)) {
            overflow.push(`${route.name}: ${offender}`);
          }
        }

        await page.screenshot({
          path: path.join(OUT_ROOT, route.name, `${width}-${label}.png`),
          fullPage: true,
        });
        shots += 1;

        await context.close();
      }

      console.log(`  ✓ ${route.name} (${route.url})`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${shots} shots written to qa/screenshots/**/${'{width}'}-${label}.png`);

  if (skipped.length > 0) {
    console.log('\nSkipped, nothing published:');
    for (const reason of skipped) console.log(`  - ${reason}`);
  }

  if (overflow.length > 0) {
    console.log('\nWider than the viewport at 360px:');
    for (const offender of overflow) console.log(`  - ${offender}`);
  } else {
    console.log('\nNo element exceeds the viewport at 360px.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
