/*
  The QA screenshot matrix.

    pnpm qa:shoot                   # writes the "before" set
    pnpm qa:shoot after             # writes the "after" set
    pnpm qa:shoot before --devices  # real device profiles, WebKit and Firefox included
    pnpm qa:shoot after --only=checkout-payment,order

  Full-page shots of every storefront route at the six widths the `ui-polish`
  skill asks for, written to `qa/screenshots/<route>/<width>-<label>.png` so a
  fix can be shown as a before/after pair at every breakpoint. `--devices`
  shoots phone and tablet profiles instead, each in the engine it really runs —
  it needs `npx playwright install webkit firefox` once (a browser download, not
  a package).

  The narrowest view of every page is also audited — anything wider than the
  viewport, tap targets under 44 × 44, text under 12px, images downloaded far
  larger than they are shown, and layout shift — into
  `qa/screenshots/_audit-<label>.txt`.

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
import { mkdir, writeFile } from 'node:fs/promises';
import {
  chromium,
  devices,
  firefox,
  webkit,
  type BrowserContextOptions,
  type BrowserType,
  type Page,
} from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { orderAccessToken } from '../src/lib/order-access';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env present, or already loaded.
}

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:3000';
const WIDTHS = [360, 390, 768, 1024, 1280, 1536] as const;
const OUT_ROOT = path.join(process.cwd(), 'qa', 'screenshots');

const args = process.argv.slice(2);
const label = args.includes('after') ? 'after' : 'before';
const deviceMode = args.includes('--devices');
const only = args
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');

type View = { name: string; engine: BrowserType; options: BrowserContextOptions };

/**
 * The phones and tablets customers actually use, each in the engine it really
 * runs: every iOS browser is WebKit underneath, so an iPhone profile rendered
 * in Chromium would prove nothing about Safari.
 */
const DEVICES: View[] = [
  { name: 'iphone-se', engine: webkit, options: devices['iPhone SE'] },
  { name: 'iphone-14', engine: webkit, options: devices['iPhone 14'] },
  { name: 'pixel-7', engine: chromium, options: devices['Pixel 7'] },
  { name: 'ipad', engine: webkit, options: devices['iPad (gen 7)'] },
  { name: 'ipad-landscape', engine: webkit, options: devices['iPad (gen 7) landscape'] },
  { name: 'firefox-1280', engine: firefox, options: { viewport: { width: 1280, height: 900 } } },
];

/**
 * - `cart` seeds a one-line cart into localStorage before any page script runs,
 *   because checkout and the drawer show nothing useful empty.
 * - `interact` drives the page into the state worth photographing.
 */
type Route = {
  name: string;
  url: string;
  cart?: boolean;
  interact?: (page: Page) => Promise<void>;
  /** A page expected to answer 404 — no warning for it. */
  notFound?: boolean;
  /** Shoot the viewport only — a fixed overlay photographed full-page is meaningless. */
  viewportOnly?: boolean;
};

async function openCart(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Cart/ }).first().click();
  await page.getByRole('dialog').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

async function fillCheckout(page: Page): Promise<void> {
  await page.getByLabel('Mobile number').fill('9847012345');
  await page.getByRole('button', { name: 'Continue to delivery' }).click();
  await page.getByLabel('Full name').fill('Anjali Menon');
  await page.getByLabel('Pincode').fill('682001');
  await page.getByLabel('House, building, street').fill('12 Marine Drive');
  await page.getByLabel('Town or city').fill('Kochi');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  // Wait for the quote, so the shot shows real totals rather than dashes.
  await page
    .locator('button[type=submit]:not([disabled])')
    .waitFor({ timeout: 20_000 })
    .catch(() => console.warn('  ! checkout: the pay button never enabled'));
}

/** Routes that exist regardless of what is in the catalogue. */
const STATIC_ROUTES: Route[] = [
  { name: 'home', url: '/' },
  { name: 'shop', url: '/shop' },
  { name: 'search', url: '/search?q=mx' },
  { name: 'stockists', url: '/stockists' },
  { name: 'story', url: '/story' },
  { name: 'not-found', url: '/this-page-does-not-exist', notFound: true },
];

/**
 * Dynamic routes, resolved against real rows. A page whose row does not exist
 * or is not published is left out — a 404 screenshot teaches nothing about
 * layout.
 */
async function dynamicRoutes(prisma: PrismaClient): Promise<{
  routes: Route[];
  skipped: string[];
  cartVariantId: string | null;
}> {
  const routes: Route[] = [];
  const skipped: string[] = [];

  const [product, brand, category, combo, variant, order, policy] = await Promise.all([
    prisma.product.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.brand.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.combo.findFirst({ where: { isActive: true } }),
    prisma.productVariant.findFirst({
      where: { isActive: true, pricePaise: { not: null }, product: { isActive: true, hsnCode: { not: null } } },
      select: { id: true },
    }),
    prisma.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { orderNumber: true } }),
    prisma.contentBlock.findFirst({
      where: { key: { startsWith: 'policy_' }, isActive: true },
      select: { key: true },
    }),
  ]);

  if (product) {
    routes.push(
      { name: 'product', url: `/products/${product.slug}` },
      // The end of the page as a phone shows it, fixed buy bar included.
      {
        name: 'product-end',
        url: `/products/${product.slug}`,
        viewportOnly: true,
        interact: async (page) => {
          await page.evaluate(REVEAL_SCRIPT);
          await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
          await page.waitForTimeout(600);
        },
      },
    );
  } else skipped.push('product — no published product');

  if (brand) routes.push({ name: 'brand', url: `/brands/${brand.slug}` });
  else skipped.push('brand — no active brand');

  if (category) routes.push({ name: 'category', url: `/categories/${category.slug}` });
  else skipped.push('category — no active category');

  if (combo) routes.push({ name: 'combo', url: `/combos/${combo.slug}` });
  else skipped.push('combo — no active combo');

  if (policy) routes.push({ name: 'policy', url: `/policies/${policy.key.replace('policy_', '')}` });
  else skipped.push('policy — none published');

  if (variant) {
    routes.push(
      { name: 'cart-drawer', url: '/shop', cart: true, interact: openCart, viewportOnly: true },
      { name: 'checkout-contact', url: '/checkout', cart: true },
      { name: 'checkout-payment', url: '/checkout', cart: true, interact: fillCheckout },
    );
  } else {
    skipped.push('cart and checkout — no priced variant to put in a cart');
  }

  if (order) {
    const token = orderAccessToken(order.orderNumber);
    routes.push({ name: 'order', url: `/order/${order.orderNumber}?t=${token}` });
  } else {
    skipped.push('order — no orders yet');
  }

  return { routes, skipped, cartVariantId: variant?.id ?? null };
}

/*
  Browser-side code is written as strings, not as closures.

  `tsx` compiles this file with esbuild's `keepNames`, which rewrites every
  function into one wrapped by a `__name` helper. Playwright serialises the
  function it is handed and evaluates it inside the page, where that helper
  does not exist — so a compiled closure dies on arrival with
  "ReferenceError: __name is not defined". A string is never transformed, so it
  arrives as written. The cost is that TypeScript cannot check inside these
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

/** Accumulates Cumulative Layout Shift from the first paint, as Chrome's CLS does. */
const CLS_INIT_SCRIPT = `(() => {
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
})()`;

/**
 * The narrow-screen audit. Tap targets follow WCAG 2.5.8's exemptions: a link
 * inside running text, and a checkbox or radio whose label is the real target.
 */
const AUDIT_SCRIPT = `(() => {
  const limit = document.documentElement.clientWidth;
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
    return el.tagName.toLowerCase() + id + cls + (text ? ' "' + text + '"' : '');
  };
  const visible = (el, rect) => {
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
  };

  const overflow = [], tap = [], tinyText = [], images = [], zoom = [];

  // Only a page that actually scrolls sideways is a problem; a marquee strip
  // wider than the screen inside a clipping parent is by design.
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true;
    }
    return false;
  };
  const pageWidth = document.documentElement.scrollWidth;
  if (pageWidth > limit + 1) {
    overflow.push('the page scrolls sideways: ' + pageWidth + 'px wide in a ' + limit + 'px viewport');
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const rect = el.getBoundingClientRect();
      if (rect.right > limit + 1 && !clipped(el)) {
        overflow.push(describe(el) + ' — right edge at ' + Math.round(rect.right) + 'px');
      }
    }
  }

  const targets = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]';
  for (const el of Array.from(document.querySelectorAll(targets))) {
    const rect = el.getBoundingClientRect();
    if (!visible(el, rect)) continue;
    if (rect.width >= 44 && rect.height >= 44) continue;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li')) continue;
    // A stretched link: its ::after overlay makes the whole card the target.
    if (getComputedStyle(el, '::after').position === 'absolute') continue;
    const label = el.closest('label');
    if (label && label.getBoundingClientRect().height >= 44) continue;
    tap.push(describe(el) + ' — ' + Math.round(rect.width) + '×' + Math.round(rect.height));
  }

  // iOS Safari zooms the whole page into any field under 16px when it is tapped.
  for (const el of Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea'))) {
    const rect = el.getBoundingClientRect();
    if (!visible(el, rect)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 16) zoom.push(describe(el) + ' — ' + size + 'px');
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || !node.textContent.trim()) continue;
    const rect = parent.getBoundingClientRect();
    if (!visible(parent, rect)) continue;
    const size = parseFloat(getComputedStyle(parent).fontSize);
    if (size < 12) tinyText.push(describe(parent) + ' — ' + size + 'px');
  }

  for (const img of Array.from(document.images)) {
    const rect = img.getBoundingClientRect();
    if (!img.complete || !visible(img, rect)) continue;
    const needed = rect.width * window.devicePixelRatio;
    if (img.naturalWidth > 400 && img.naturalWidth > needed * 2) {
      images.push((img.alt || img.currentSrc.split('/').pop().slice(0, 40)) +
        ' — ' + img.naturalWidth + 'px downloaded for ' + Math.round(rect.width) + 'px shown');
    }
  }

  const uniq = (list) => Array.from(new Set(list)).slice(0, 12);
  return {
    overflow: uniq(overflow),
    tap: uniq(tap),
    tinyText: uniq(tinyText),
    images: uniq(images),
    zoom: uniq(zoom),
    cls: Math.round((window.__cls || 0) * 1000) / 1000,
  };
})()`;

type Audit = {
  overflow: string[];
  tap: string[];
  tinyText: string[];
  images: string[];
  zoom: string[];
  cls: number;
};

async function revealEverything(page: Page): Promise<void> {
  await page.evaluate(REVEAL_SCRIPT);
}

function cartSeedScript(variantId: string): string {
  const value = JSON.stringify({
    state: { lines: [{ kind: 'VARIANT', id: variantId, quantity: 2 }], discountCode: null },
    version: 2,
  });
  return `try { localStorage.setItem('bb-cart', ${JSON.stringify(value)}); } catch {}`;
}

function auditLines(audit: Audit): string[] {
  const lines: string[] = [];
  const section = (title: string, list: string[]) => {
    if (list.length) lines.push(`  ${title}:`, ...list.map((l) => `    - ${l}`));
  };
  section('wider than the viewport', audit.overflow);
  section('tap targets under 44×44', audit.tap);
  section('text under 12px', audit.tinyText);
  section('images far larger than shown', audit.images);
  section('inputs under 16px (iPhone zooms on tap)', audit.zoom);
  if (audit.cls >= 0.1) lines.push(`  layout shift: CLS ${audit.cls} (target < 0.1)`);
  return lines.length ? lines : ['  clean'];
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const { routes: dynamic, skipped, cartVariantId } = await dynamicRoutes(prisma);
  await prisma.$disconnect();

  const routes = [...STATIC_ROUTES, ...dynamic].filter((r) => !only || only.includes(r.name));

  const views: View[] = deviceMode
    ? DEVICES
    : WIDTHS.map((width) => ({
        name: String(width),
        engine: chromium,
        options: { viewport: { width, height: 900 }, deviceScaleFactor: 1 },
      }));
  // The narrowest view of each page is the one audited.
  const auditView = deviceMode ? 'iphone-se' : '360';

  const report: string[] = [];
  const totals = { overflow: 0, tap: 0, tinyText: 0, images: 0, zoom: 0, cls: 0 };
  let shots = 0;

  for (const view of views) {
    const browser = await view.engine.launch();
    try {
      for (const route of routes) {
        await mkdir(path.join(OUT_ROOT, route.name), { recursive: true });
        const context = await browser.newContext(view.options);
        await context.addInitScript(CLS_INIT_SCRIPT);
        if (route.cart && cartVariantId) await context.addInitScript(cartSeedScript(cartVariantId));
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));

        try {
          // Checkout never goes network-idle once Razorpay's script is posting
          // telemetry, so cart routes wait for `load` and a settle instead.
          const response = await page.goto(`${BASE_URL}${route.url}`, {
            waitUntil: route.cart ? 'load' : 'networkidle',
            timeout: 90_000,
          });
          if (route.cart) await page.waitForTimeout(2000);
          if (response && response.status() >= 400 && !route.notFound) {
            console.warn(`  ! ${route.name} @ ${view.name} returned HTTP ${response.status()}`);
          }

          if (route.interact) await route.interact(page);
          else await revealEverything(page);

          if (view.name === auditView) {
            const audit = (await page.evaluate(AUDIT_SCRIPT)) as Audit;
            totals.overflow += audit.overflow.length;
            totals.tap += audit.tap.length;
            totals.tinyText += audit.tinyText.length;
            totals.images += audit.images.length;
            totals.zoom += audit.zoom.length;
            if (audit.cls >= 0.1) totals.cls += 1;
            report.push(`${route.name} @ ${view.name} (CLS ${audit.cls})`, ...auditLines(audit));
          }

          await page.screenshot({
            path: path.join(OUT_ROOT, route.name, `${view.name}-${label}.png`),
            fullPage: !route.viewportOnly,
          });
          shots += 1;
          if (errors.length) {
            console.warn(`  ! ${route.name} @ ${view.name} script errors: ${errors.join(' | ')}`);
          }
        } catch (error) {
          console.warn(`  ! ${route.name} @ ${view.name} failed: ${(error as Error).message.split('\n')[0]}`);
        } finally {
          await context.close();
        }
      }
      console.log(`  ✓ ${view.name}`);
    } finally {
      await browser.close();
    }
  }

  const auditPath = path.join(OUT_ROOT, `_audit-${label}${deviceMode ? '-devices' : ''}.txt`);
  await writeFile(auditPath, report.join('\n') + '\n');

  console.log(`\n${shots} shots written to qa/screenshots/**/{view}-${label}.png`);
  if (skipped.length > 0) {
    console.log('\nSkipped, nothing published:');
    for (const reason of skipped) console.log(`  - ${reason}`);
  }
  console.log(
    `\nAudit at ${auditView}: ${totals.overflow} overflow, ${totals.tap} small tap targets, ` +
      `${totals.tinyText} tiny text, ${totals.images} oversized images, ` +
      `${totals.zoom} zooming inputs, ` +
      `${totals.cls} pages with CLS ≥ 0.1`,
  );
  console.log(`Details: ${path.relative(process.cwd(), auditPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
