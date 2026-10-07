/*
  End-to-end check of the admin panel, in a real browser.

    pnpm e2e:admin                          # everything, against http://localhost:3000
    pnpm e2e:admin --only=access,brands     # named sections
    pnpm e2e:admin --discover               # print every admin form's fields and stop
    E2E_BASE_URL=https://… E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… pnpm e2e:admin --read-only
    … pnpm e2e:admin --read-only --live-edit   # plus one reversible announcement-bar edit

  It signs in as each staff role, opens every admin page, and works through the
  create / edit / delete flows the way a person would: filling the real forms
  and pressing the real buttons, so the server actions, their Zod validation
  and their role guards are what is being tested — not a re-implementation.

  Everything it creates is named `ZZE2E …` and removed at the end, including
  after a crash. It writes to the database it is pointed at, so it refuses
  anything but a local one; `--read-only` is the only mode allowed elsewhere,
  and that mode opens pages and nothing more.

  The seeded dev accounts (prisma/seed.ts) are used locally. They do not exist
  on a hosted database, which is why read-only mode takes its own credentials.
*/

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { db } from '@/lib/db';

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const READ_ONLY = process.argv.includes('--read-only');
const DISCOVER = process.argv.includes('--discover');
const ONLY = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');

const DEV_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'ChangeMe!Dev1';
const SHOTS = path.join(process.cwd(), 'qa', 'screenshots', 'admin');

type Role = 'STAFF' | 'MANAGER' | 'ADMIN';

const ACCOUNTS: Record<Role, { email: string; password: string }> = {
  STAFF: { email: 'staff@dev.bbtc.local', password: DEV_PASSWORD },
  MANAGER: { email: 'manager@dev.bbtc.local', password: DEV_PASSWORD },
  ADMIN: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@dev.bbtc.local',
    password: process.env.E2E_ADMIN_PASSWORD ?? DEV_PASSWORD,
  },
};

// ---------- reporting ----------

let failures = 0;
let passes = 0;
const problems: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passes += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    const line = `FAIL  ${name}${detail === undefined ? '' : `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`;
    console.log(line);
    problems.push(line);
  }
}

function section(title: string) {
  console.log(`\n== ${title} ==`);
}

function wants(name: string): boolean {
  return !ONLY || ONLY.includes(name);
}

// ---------- browser plumbing ----------

/** What went wrong on a page without anyone asserting on it. */
interface PageNoise {
  consoleErrors: string[];
  serverErrors: string[];
}

const noiseByPage = new WeakMap<Page, PageNoise>();

/** Messages that are not this app's fault and would otherwise drown the signal. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  // A 403 or 404 page is an expected outcome in the access matrix; the browser
  // still logs the status as a console error.
  /Failed to load resource: the server responded with a status of (403|404)/i,
  // A server-side log line the dev server forwards to the browser: Shiprocket
  // refusing the credentials in .env is the environment, not the page.
  /\[shiprocket\] login failed/i,
];

async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  const noise: PageNoise = { consoleErrors: [], serverErrors: [] };
  noiseByPage.set(page, noise);

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    noise.consoleErrors.push(text.slice(0, 300));
  });
  page.on('pageerror', (error) => noise.consoleErrors.push(`uncaught: ${error.message.slice(0, 300)}`));
  page.on('response', (response) => {
    if (response.status() >= 500 && response.url().startsWith(BASE)) {
      noise.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url().replace(BASE, '')}`);
    }
  });

  return page;
}

function drainNoise(page: Page): PageNoise {
  const noise = noiseByPage.get(page) ?? { consoleErrors: [], serverErrors: [] };
  const copy = { consoleErrors: [...noise.consoleErrors], serverErrors: [...noise.serverErrors] };
  noise.consoleErrors.length = 0;
  noise.serverErrors.length = 0;
  return copy;
}

/** Asserts that nothing went wrong behind the scenes since the last call. */
function checkQuiet(page: Page, where: string) {
  const noise = drainNoise(page);
  check(`${where}: no server errors`, noise.serverErrors.length === 0, noise.serverErrors);
  check(`${where}: no console errors`, noise.consoleErrors.length === 0, noise.consoleErrors);
}

async function signIn(page: Page, role: Role): Promise<boolean> {
  const { email, password } = ACCOUNTS[role];
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/admin/login'), { timeout: 30_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  return new URL(page.url()).pathname === '/admin';
}

async function contextFor(browser: Browser, role: Role): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await newPage(context);
  const ok = await signIn(page, role);
  if (!ok) throw new Error(`Could not sign in as ${role} (${ACCOUNTS[role].email}).`);
  drainNoise(page);
  return { context, page };
}

/**
 * Lets hydration and on-load requests finish, so their errors are seen.
 *
 * Not `networkidle`: the dev server keeps a hot-reload connection open and the
 * storefront keeps animating, so "idle" is often never reached and every page
 * would cost the whole timeout. A short cap is enough for a server-rendered app.
 */
async function quiet(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => null);
}

async function open(page: Page, pathname: string): Promise<number> {
  // Admin pages wait for `load`. Storefront pages only for the document: `load`
  // there waits on every product photograph, optimised on first request.
  const waitUntil = pathname.startsWith('/admin') ? 'load' : 'domcontentloaded';
  // One retry: a navigation that is interrupted by the previous page's own
  // redirect (ERR_ABORTED) says nothing about the page being opened.
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await page.goto(`${BASE}${pathname}`, { waitUntil, timeout: 60_000 });
      await quiet(page);
      return response?.status() ?? 0;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(1000);
    }
  }
}

// ---------- the admin's URLs ----------

interface Route {
  path: string;
  /** The lowest role that may open it. */
  minimum: Role;
}

const RANK: Record<Role, number> = { STAFF: 1, MANAGER: 2, ADMIN: 3 };

/**
 * Every admin page, with one real id substituted into each dynamic route.
 * Routes whose table is empty are skipped and reported, not guessed at.
 */
async function adminRoutes(): Promise<{ routes: Route[]; skipped: string[] }> {
  const [brand, category, product, variant, combo, comboItem, discount, order, retailer] = await Promise.all([
    db.brand.findFirst({ select: { id: true } }),
    db.category.findFirst({ select: { id: true } }),
    db.product.findFirst({ select: { id: true } }),
    db.productVariant.findFirst({ select: { id: true, productId: true } }),
    db.combo.findFirst({ select: { id: true } }),
    db.comboItem.findFirst({ select: { id: true, comboId: true } }),
    db.discount.findFirst({ select: { id: true } }),
    db.order.findFirst({ select: { id: true } }),
    db.retailer.findFirst({ select: { id: true } }),
  ]);

  const routes: Route[] = [
    { path: '/admin', minimum: 'STAFF' },
    { path: '/admin/orders', minimum: 'STAFF' },
    { path: '/admin/reports', minimum: 'MANAGER' },
    { path: '/admin/products', minimum: 'MANAGER' },
    { path: '/admin/products/new', minimum: 'MANAGER' },
    { path: '/admin/products/quick-add', minimum: 'MANAGER' },
    { path: '/admin/inventory', minimum: 'MANAGER' },
    { path: '/admin/combos', minimum: 'MANAGER' },
    { path: '/admin/combos/new', minimum: 'MANAGER' },
    { path: '/admin/discounts', minimum: 'MANAGER' },
    { path: '/admin/discounts/new', minimum: 'MANAGER' },
    { path: '/admin/brands', minimum: 'MANAGER' },
    { path: '/admin/brands/new', minimum: 'MANAGER' },
    { path: '/admin/categories', minimum: 'MANAGER' },
    { path: '/admin/categories/new', minimum: 'MANAGER' },
    { path: '/admin/reviews', minimum: 'MANAGER' },
    { path: '/admin/content', minimum: 'MANAGER' },
    { path: '/admin/content/announcement_bar', minimum: 'MANAGER' },
    { path: '/admin/content/policy_returns', minimum: 'MANAGER' },
    { path: '/admin/retailers', minimum: 'MANAGER' },
    { path: '/admin/retailers/new', minimum: 'MANAGER' },
    { path: '/admin/retailers/import', minimum: 'MANAGER' },
    { path: '/admin/settings', minimum: 'ADMIN' },
  ];
  const skipped: string[] = [];

  const dynamic: Array<[string | null | undefined, string, Role]> = [
    [brand && `/admin/brands/${brand.id}`, 'brand detail', 'MANAGER'],
    [category && `/admin/categories/${category.id}`, 'category detail', 'MANAGER'],
    [product && `/admin/products/${product.id}`, 'product detail', 'MANAGER'],
    [product && `/admin/products/${product.id}/images`, 'product images', 'MANAGER'],
    [product && `/admin/products/${product.id}/variants`, 'product variants', 'MANAGER'],
    [product && `/admin/products/${product.id}/variants/new`, 'new variant', 'MANAGER'],
    [variant && `/admin/products/${variant.productId}/variants/${variant.id}`, 'variant detail', 'MANAGER'],
    [variant && `/admin/inventory/${variant.id}`, 'stock detail', 'MANAGER'],
    [combo && `/admin/combos/${combo.id}`, 'combo detail', 'MANAGER'],
    [combo && `/admin/combos/${combo.id}/items`, 'combo items', 'MANAGER'],
    [combo && `/admin/combos/${combo.id}/items/new`, 'new combo item', 'MANAGER'],
    [comboItem && `/admin/combos/${comboItem.comboId}/items/${comboItem.id}`, 'combo item detail', 'MANAGER'],
    [discount && `/admin/discounts/${discount.id}`, 'discount detail', 'MANAGER'],
    [order && `/admin/orders/${order.id}`, 'order detail', 'STAFF'],
    [retailer && `/admin/retailers/${retailer.id}`, 'retailer detail', 'MANAGER'],
  ];
  for (const [routePath, label, minimum] of dynamic) {
    if (routePath) routes.push({ path: routePath, minimum });
    else skipped.push(label);
  }

  return { routes, skipped };
}

// ---------- sections ----------

async function discover(browser: Browser) {
  const { context, page } = await contextFor(browser, 'ADMIN');
  const { routes } = await adminRoutes();
  for (const route of routes) {
    const status = await open(page, route.path);
    // A string, not a closure: tsx wraps named functions in a `__name` helper
    // that does not exist inside the page.
    const summary = (await page.evaluate(`(() => {
      const clean = (el) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
      return {
        h1: clean(document.querySelector('h1')),
        forms: Array.from(document.querySelectorAll('form')).map((form) => ({
          fields: Array.from(form.querySelectorAll('input, select, textarea'))
            .map((el) => {
              if (el.type === 'hidden' && el.name.startsWith('$ACTION')) return null;
              const options = el.tagName === 'SELECT'
                ? '{' + Array.from(el.options).slice(0, 6).map((o) => o.value).join('|') + '}'
                : '';
              const kind = el.tagName === 'INPUT' ? el.type : el.tagName.toLowerCase();
              return (el.name || '(unnamed)') + ':' + kind + (el.required ? '*' : '') + options;
            })
            .filter(Boolean),
          buttons: Array.from(form.querySelectorAll('button')).map((b) => clean(b)),
        })),
        links: Array.from(document.querySelectorAll('main a[href^="/admin"]'))
          .map((a) => clean(a) + ' -> ' + a.getAttribute('href'))
          .slice(0, 12),
      };
    })()`)) as { h1: string; forms: Array<{ fields: string[]; buttons: string[] }>; links: string[] };
    console.log(`\n### ${route.path}  [${status}]  h1="${summary.h1}"`);
    for (const form of summary.forms) {
      console.log(`  form: ${form.fields.join(', ')}`);
      console.log(`        buttons: ${form.buttons.join(' | ')}`);
    }
    if (summary.links.length) console.log(`  links: ${summary.links.join('; ')}`);
  }
  await context.close();
}

/** Sign-in, sign-out, and the role matrix across every admin URL. */
async function accessSection(browser: Browser) {
  section('Sign-in and access');

  // No session.
  {
    const context = await browser.newContext();
    const page = await newPage(context);
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    check('/admin without a session redirects to the login page', new URL(page.url()).pathname === '/admin/login');

    await page.fill('input[name="email"]', ACCOUNTS.ADMIN.email);
    await page.fill('input[name="password"]', 'definitely-not-the-password');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    const stillOnLogin = new URL(page.url()).pathname === '/admin/login';
    const message = await page.locator('[role="alert"], form p').allTextContents();
    check('a wrong password is refused', stillOnLogin);
    check(
      'a wrong password explains itself',
      message.some((text) => /do not match|password/i.test(text)),
      message,
    );
    await context.close();
  }

  const { routes, skipped } = await adminRoutes();
  if (skipped.length) console.log(`(skipped, nothing in the database to open: ${skipped.join(', ')})`);

  for (const role of ['STAFF', 'MANAGER', 'ADMIN'] as Role[]) {
    if (READ_ONLY && role !== 'ADMIN') continue;
    const { context, page } = await contextFor(browser, role);
    check(`${role} can sign in and lands on the dashboard`, true);

    for (const route of routes) {
      const allowed = RANK[role] >= RANK[route.minimum];
      const status = await open(page, route.path);
      const landed = new URL(page.url()).pathname;
      if (allowed) {
        check(`${role} opens ${route.path}`, status === 200 && landed === route.path, { status, landed });
        checkQuiet(page, `${role} ${route.path}`);
      } else {
        check(`${role} is refused ${route.path} with a 403`, status === 403, { status, landed });
        drainNoise(page);
      }
    }

    // Sign out ends the session.
    if (role === 'ADMIN' && !READ_ONLY) {
      await open(page, '/admin');
      const signOut = page.getByRole('button', { name: /sign out|log out/i }).first();
      if (await signOut.count()) {
        await Promise.all([page.waitForURL('**/admin/login', { timeout: 20_000 }).catch(() => null), signOut.click()]);
        check('signing out returns to the login page', new URL(page.url()).pathname === '/admin/login', page.url());
        await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
        check('signing out ends the session', new URL(page.url()).pathname === '/admin/login', page.url());
        const cookies = (await context.cookies()).map((cookie) => cookie.name);
        check('...and removes the session cookie', !cookies.some((name) => name.endsWith('session-token')), cookies);
      } else {
        check('the admin has a sign-out control', false, 'no button named "Sign out" found');
      }
    }
    await context.close();
  }
}

// ---------- form helpers ----------

type FieldValue = string | boolean;

/** Fills fields by `name` inside the form that owns the named submit button. */
async function fillAndSubmit(
  page: Page,
  button: string | RegExp,
  values: Record<string, FieldValue>,
): Promise<void> {
  const submit = page.getByRole('button', { name: button }).first();
  const form = page.locator('form').filter({ has: submit }).first();
  for (const [name, value] of Object.entries(values)) {
    const field = form.locator(`[name="${name}"]`).first();
    if (typeof value === 'boolean') {
      await field.setChecked(value);
    } else if ((await field.evaluate((el) => el.tagName)) === 'SELECT') {
      await field.selectOption(value);
    } else {
      await field.fill(value);
    }
  }
  await act(page, () => submit.click());
}

/** Waits for whatever a navigation or re-render is still loading. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load').catch(() => null);
  await quiet(page);
}

/**
 * Performs a click that runs a server action, and waits for its answer.
 *
 * A server action is a POST whose response re-renders the form. Waiting for
 * "network idle" alone can return before that POST has even left, and the
 * validation message a test is about to look for is not on the page yet.
 */
async function act(page: Page, click: () => Promise<void>): Promise<void> {
  const answered = page
    .waitForResponse((response) => response.request().method() === 'POST' && response.url().startsWith(BASE), {
      timeout: 20_000,
    })
    .catch(() => null);
  await click();
  await answered;
  await settle(page);
  await page.waitForTimeout(250);
}

/** Polls the database, because a redirect can land before the row is readable. */
async function eventually<T>(read: () => Promise<T | null | undefined>, ms = 8000): Promise<T | null> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function pageText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

/** True once the page shows text matching `pattern`. Polls, because a redirect may still be rendering. */
async function sees(page: Page, pattern: RegExp, ms = 10_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (pattern.test(await pageText(page).catch(() => ''))) return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(300);
  }
}

/** The first part of the page, for a failure message. */
async function excerpt(page: Page): Promise<string> {
  return `${new URL(page.url()).pathname} :: ${(await pageText(page)).slice(0, 320)}`;
}

/** Clicks the button in the table row or card that mentions `text`. */
async function clickInRow(page: Page, text: string, button: string | RegExp): Promise<boolean> {
  const row = page.locator('tr, li, article').filter({ hasText: text }).last();
  const target = row.getByRole('button', { name: button }).first();
  if (!(await target.count())) return false;
  await act(page, () => target.click());
  return true;
}

async function auditCount(entityType: string, entityId: string): Promise<number> {
  return db.auditLog.count({ where: { entityType, entityId } });
}

// ---------- test data ----------

/** Distinct from the `ZZTEST` rows earlier manual passes left behind, so cleanup only removes its own. */
const P = 'ZZE2E';
const SLUG = 'zze2e';
const runStartedAt = new Date();

async function cleanup(): Promise<void> {
  const products = await db.product.findMany({ where: { name: { startsWith: P } }, select: { id: true } });
  const productIds = products.map((p) => p.id);
  const variants = await db.productVariant.findMany({
    where: { productId: { in: productIds } },
    select: { id: true },
  });
  const variantIds = variants.map((v) => v.id);

  const orders = await db.order.findMany({ where: { notes: { startsWith: P } }, select: { id: true } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });

  const combos = await db.combo.findMany({ where: { name: { startsWith: P } }, select: { id: true } });
  await db.comboItem.deleteMany({
    where: { OR: [{ comboId: { in: combos.map((c) => c.id) } }, { variantId: { in: variantIds } }] },
  });
  await db.combo.deleteMany({ where: { id: { in: combos.map((c) => c.id) } } });
  await db.discount.deleteMany({ where: { name: { startsWith: P } } });
  // Files the admin's own delete did not get to (a failed run, or --keep).
  const strayImages = await db.productImage.findMany({ where: { productId: { in: productIds } }, select: { url: true } });
  await Promise.all(strayImages.map((image) => removeStoredObject(image.url)));
  await db.review.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.category.deleteMany({ where: { slug: { startsWith: `${SLUG}-sub` } } });
  await db.category.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await db.brand.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await db.retailer.deleteMany({ where: { name: { startsWith: P } } });
  // The audit trail of a test run is noise, not history.
  const devUsers = await db.user.findMany({
    where: { email: { endsWith: '@dev.bbtc.local' } },
    select: { id: true },
  });
  await db.auditLog.deleteMany({
    where: { createdAt: { gte: runStartedAt }, userId: { in: devUsers.map((u) => u.id) } },
  });
}

// ---------- catalogue ----------

async function brandsSection(page: Page) {
  section('Brands');

  await open(page, '/admin/brands/new');
  await fillAndSubmit(page, /create brand/i, {
    name: `${P} Brand`,
    slug: `${SLUG}-brand`,
    segment: 'HOME_CARE',
    accentHex: 'not-a-colour',
  });
  check('a brand with a bad colour is refused', !(await db.brand.findUnique({ where: { slug: `${SLUG}-brand` } })));
  check('...and the form says why', await sees(page, /hex colour|highlighted/i), await excerpt(page));

  await open(page, '/admin/brands/new');
  await fillAndSubmit(page, /create brand/i, {
    name: `${P} Brand`,
    slug: `${SLUG}-brand`,
    segment: 'HOME_CARE',
    accentHex: '#123456',
    tagline: 'Made for the test run',
  });
  const brand = await eventually(() => db.brand.findUnique({ where: { slug: `${SLUG}-brand` } }));
  check('a valid brand is created', Boolean(brand), await excerpt(page));
  if (!brand) return;
  check('...and audited', (await auditCount('Brand', brand.id)) === 1);
  checkQuiet(page, 'brand create');

  await open(page, '/admin/brands/new');
  await fillAndSubmit(page, /create brand/i, {
    name: `${P} Brand Again`,
    slug: `${SLUG}-brand`,
    segment: 'HOME_CARE',
    accentHex: '#123456',
  });
  check('a duplicate slug is refused, not a crash', (await db.brand.count({ where: { slug: `${SLUG}-brand` } })) === 1);
  check('...with a message', await sees(page, /already|taken|in use|exists/i), await excerpt(page));
  checkQuiet(page, 'brand duplicate');

  await open(page, `/admin/brands/${brand.id}`);
  await fillAndSubmit(page, /save changes/i, { tagline: 'Edited by the test run' });
  const edited = await eventually(async () => {
    const row = await db.brand.findUnique({ where: { id: brand.id } });
    return row?.tagline === 'Edited by the test run' ? row : null;
  });
  check('a brand edit is saved', Boolean(edited), await excerpt(page));

  await open(page, '/admin/brands');
  const clicked = await clickInRow(page, `${P} Brand`, /deactivate/i);
  const off = await eventually(async () => {
    const row = await db.brand.findUnique({ where: { id: brand.id } });
    return row && !row.isActive ? row : null;
  });
  check('a brand can be deactivated from the list', clicked && Boolean(off));
  await open(page, '/admin/brands');
  await clickInRow(page, `${P} Brand`, /^(re)?activate/i);
  const on = await eventually(async () => {
    const row = await db.brand.findUnique({ where: { id: brand.id } });
    return row?.isActive ? row : null;
  });
  check('...and reactivated', Boolean(on));
  checkQuiet(page, 'brand list actions');
}

async function categoriesSection(page: Page) {
  section('Categories');

  await open(page, '/admin/categories/new');
  await fillAndSubmit(page, /create category/i, { name: `${P} Category`, slug: 'Not A Slug!' });
  check('a category with a bad slug is refused', (await db.category.count({ where: { name: `${P} Category` } })) === 0);

  await open(page, '/admin/categories/new');
  await fillAndSubmit(page, /create category/i, { name: `${P} Category`, slug: `${SLUG}-category` });
  const category = await eventually(() => db.category.findUnique({ where: { slug: `${SLUG}-category` } }));
  check('a valid category is created', Boolean(category), await excerpt(page));
  if (!category) return;
  check('...and audited', (await auditCount('Category', category.id)) === 1);

  await open(page, `/admin/categories/new?parent=${category.id}`);
  await fillAndSubmit(page, /create category/i, { name: `${P} Sub`, slug: `${SLUG}-sub` });
  const sub = await eventually(() => db.category.findUnique({ where: { slug: `${SLUG}-sub` } }));
  check('a sub-category is created under its parent', sub?.parentId === category.id, sub);

  await open(page, `/admin/categories/${category.id}`);
  await fillAndSubmit(page, /save changes/i, { description: 'Edited by the test run' });
  const edited = await eventually(async () => {
    const row = await db.category.findUnique({ where: { id: category.id } });
    return row?.description === 'Edited by the test run' ? row : null;
  });
  check('a category edit is saved', Boolean(edited), await excerpt(page));
  checkQuiet(page, 'categories');
}

async function productsSection(page: Page) {
  section('Products and variants');

  const brand = await db.brand.findUnique({ where: { slug: `${SLUG}-brand` } });
  const category = await db.category.findUnique({ where: { slug: `${SLUG}-category` } });
  if (!brand || !category) {
    check('products need the test brand and category', false, 'run the brands and categories sections first');
    return;
  }

  await open(page, '/admin/products/new');
  await fillAndSubmit(page, /create product/i, {
    name: `${P} Product`,
    slug: `${SLUG}-product`,
    brandId: brand.id,
    categoryId: category.id,
    shortDesc: 'A product made by the test run.',
    description: 'It exists to exercise the admin and is removed afterwards.',
  });
  const product = await eventually(() => db.product.findUnique({ where: { slug: `${SLUG}-product` } }));
  check('a product is created from the full form', Boolean(product), await excerpt(page));
  if (!product) return;
  check('...as a draft', product.isActive === false);
  check('...with no tax details guessed', product.hsnCode === null && product.gstRate === null, {
    hsn: product.hsnCode,
    gst: product.gstRate,
  });
  check('...and audited', (await auditCount('Product', product.id)) >= 1);
  checkQuiet(page, 'product create');

  await open(page, '/admin/products/new');
  await fillAndSubmit(page, /create product/i, {
    name: `${P} Product Twin`,
    slug: `${SLUG}-product`,
    brandId: brand.id,
    categoryId: category.id,
    shortDesc: 'Same slug.',
    description: 'Same slug.',
  });
  check('a duplicate product slug is refused', (await db.product.count({ where: { slug: `${SLUG}-product` } })) === 1);
  check('...with a message, not an error page', await sees(page, /already|taken|in use|exists/i), await excerpt(page));
  checkQuiet(page, 'product duplicate');

  // Variants: money goes in as rupees and must be stored as whole paise.
  await open(page, `/admin/products/${product.id}/variants/new`);
  await fillAndSubmit(page, /create variant/i, {
    sku: `${P}-SKU-1`,
    variantName: 'Test Lemon',
    size: '500 ml',
    mrpRupees: '160',
    priceRupees: '149.50',
    weightGrams: '550',
  });
  const priced = await eventually(() => db.productVariant.findUnique({ where: { sku: `${P}-SKU-1` } }));
  check('a variant is created', Boolean(priced), await excerpt(page));
  check('Rs 149.50 is stored as 14950 paise', priced?.pricePaise === 14950, priced?.pricePaise);
  check('Rs 160 MRP is stored as 16000 paise', priced?.mrpPaise === 16000, priced?.mrpPaise);

  await open(page, `/admin/products/${product.id}/variants/new`);
  await fillAndSubmit(page, /create variant/i, { sku: `${P}-SKU-2`, variantName: 'Test Mint', size: '1 L' });
  const unpriced = await eventually(() => db.productVariant.findUnique({ where: { sku: `${P}-SKU-2` } }));
  check('a variant with no price is allowed', Boolean(unpriced), await excerpt(page));
  check('...and its price is null, never zero', unpriced?.pricePaise === null, unpriced?.pricePaise);

  await open(page, `/admin/products/${product.id}/variants/new`);
  await fillAndSubmit(page, /create variant/i, { sku: `${P}-SKU-3`, size: '2 L', priceRupees: 'nineteen' });
  check('a price that is not a number is refused', !(await db.productVariant.findUnique({ where: { sku: `${P}-SKU-3` } })));

  await open(page, `/admin/products/${product.id}/variants/new`);
  await fillAndSubmit(page, /create variant/i, { sku: `${P}-SKU-1`, size: '250 ml' });
  check('a duplicate SKU is refused', (await db.productVariant.count({ where: { sku: `${P}-SKU-1` } })) === 1);
  checkQuiet(page, 'variants');

  if (priced) {
    await open(page, `/admin/products/${product.id}/variants/${priced.id}`);
    await fillAndSubmit(page, /save changes/i, { priceRupees: '19.99' });
    const repriced = await eventually(async () => {
      const row = await db.productVariant.findUnique({ where: { id: priced.id } });
      return row?.pricePaise === 1999 ? row : null;
    });
    check(
      'Rs 19.99 is stored as exactly 1999 paise',
      Boolean(repriced),
      (await db.productVariant.findUnique({ where: { id: priced.id } }))?.pricePaise,
    );
  }

  // Publish guard.
  await open(page, '/admin/products');
  await clickInRow(page, `${P} Product`, /publish/i);
  check(
    'publishing without an image or tax details is refused',
    (await db.product.findUnique({ where: { id: product.id } }))?.isActive === false,
  );
  check('...and the admin is told what is missing', await sees(page, /cannot publish/i), await excerpt(page));
  checkQuiet(page, 'publish guard');

  await open(page, `/admin/products/${product.id}`);
  await fillAndSubmit(page, /save changes/i, { hsnCode: '3402', gstRatePercent: '18' });
  const taxed = await eventually(async () => {
    const row = await db.product.findUnique({ where: { id: product.id } });
    return row?.hsnCode === '3402' ? row : null;
  });
  check('HSN code is saved', Boolean(taxed), await excerpt(page));
  check('18% GST is stored as 1800 basis points', taxed?.gstRate === 1800, taxed?.gstRate);

  await open(page, '/admin/products');
  await clickInRow(page, `${P} Product`, /publish/i);
  check(
    'publishing is still refused with no image',
    (await db.product.findUnique({ where: { id: product.id } }))?.isActive === false,
  );
  checkQuiet(page, 'product edit');
}

async function retailersSection(page: Page) {
  section('Retailers');

  await open(page, '/admin/retailers/new');
  await fillAndSubmit(page, /add retailer/i, { name: `${P} Shop`, pincode: '12' });
  check('a retailer with a bad pincode is refused', (await db.retailer.count({ where: { name: `${P} Shop` } })) === 0);

  const shop = {
    name: `${P} Shop`,
    address: '12 Test Road',
    city: 'Kochi',
    district: 'Ernakulam',
    pincode: '682001',
    phone: '9847012345',
  };
  await open(page, '/admin/retailers/new');
  await fillAndSubmit(page, /add retailer/i, shop);
  const retailer = await eventually(() => db.retailer.findFirst({ where: { name: `${P} Shop` } }));
  check('a valid retailer is created', Boolean(retailer), await excerpt(page));
  if (!retailer) return;
  check('...and audited', (await auditCount('Retailer', retailer.id)) === 1);

  await open(page, '/admin/retailers/new');
  await fillAndSubmit(page, /add retailer/i, shop);
  check(
    'the same shop at the same pincode is not listed twice',
    (await db.retailer.count({ where: { name: `${P} Shop` } })) === 1,
  );

  await open(page, `/admin/retailers/${retailer.id}`);
  await fillAndSubmit(page, /save retailer/i, { city: 'Ernakulam' });
  const edited = await eventually(async () => {
    const row = await db.retailer.findUnique({ where: { id: retailer.id } });
    return row?.city === 'Ernakulam' ? row : null;
  });
  check('a retailer edit is saved', Boolean(edited), await excerpt(page));

  await open(page, '/stockists');
  check('the retailer appears on the public stockists page', (await pageText(page)).includes(`${P} Shop`));

  await open(page, '/admin/retailers');
  await clickInRow(page, `${P} Shop`, /hide/i);
  const hidden = await eventually(async () => {
    const row = await db.retailer.findUnique({ where: { id: retailer.id } });
    return row && !row.isActive ? row : null;
  });
  check('a retailer can be hidden from the list', Boolean(hidden));
  await open(page, '/stockists');
  check('...and then leaves the public stockists page', !(await pageText(page)).includes(`${P} Shop`));

  // CSV import.
  const header = 'name,address,city,district,pincode,phone';
  const upload = async (name: string, body: string) => {
    await open(page, '/admin/retailers/import');
    await page.setInputFiles('input[name="file"]', { name, mimeType: 'text/csv', buffer: Buffer.from(body) });
    await act(page, () => page.getByRole('button', { name: /import/i }).first().click());
  };

  await upload(
    'good.csv',
    `${header}\n${P} Import One,1 Market Road,Thrissur,Thrissur,680001,9847011111\n${P} Import Two,2 Market Road,Kollam,Kollam,691001,9847022222\n`,
  );
  const imported = await eventually(async () => {
    const count = await db.retailer.count({ where: { name: { startsWith: `${P} Import` } } });
    return count === 2 ? count : null;
  });
  check('a well-formed CSV imports every row', imported === 2, await excerpt(page));

  await upload('bad.csv', `${header}\n${P} Import Bad,,Nowhere,,12,not-a-phone\n`);
  check('a malformed row is not imported', (await db.retailer.count({ where: { name: `${P} Import Bad` } })) === 0);
  check('...and the page reports it', await sees(page, /row|line|skipp|could not|invalid|error/i), await excerpt(page));

  await upload('junk.csv', 'this is not,a retailer file\n1,2\n');
  checkQuiet(page, 'retailers (including a junk CSV)');
}

// ---------- combos and discounts ----------

async function combosSection(page: Page) {
  section('Combos');

  const variant = await db.productVariant.findUnique({ where: { sku: `${P}-SKU-1` } });
  if (!variant) {
    check('combos need the test variant', false, 'run the products section first');
    return;
  }

  await open(page, '/admin/combos/new');
  await fillAndSubmit(page, /create combo/i, {
    name: `${P} Combo`,
    slug: `${SLUG}-combo`,
    shortDesc: 'A combo made by the test run.',
    description: 'Removed afterwards.',
    priceRupees: 'free',
  });
  check('a combo with a price that is not a number is refused', !(await db.combo.findUnique({ where: { slug: `${SLUG}-combo` } })));

  await open(page, '/admin/combos/new');
  await fillAndSubmit(page, /create combo/i, {
    name: `${P} Combo`,
    slug: `${SLUG}-combo`,
    shortDesc: 'A combo made by the test run.',
    description: 'Removed afterwards.',
    priceRupees: '299',
  });
  const combo = await eventually(() => db.combo.findUnique({ where: { slug: `${SLUG}-combo` } }));
  check('a combo is created', Boolean(combo), await excerpt(page));
  if (!combo) return;
  check('Rs 299 is stored as 29900 paise', combo.pricePaise === 29900, combo.pricePaise);
  check('...and audited', (await auditCount('Combo', combo.id)) >= 1);

  await open(page, '/admin/combos');
  const tried = await clickInRow(page, `${P} Combo`, /^publish$|^activate$/i);
  if (tried) {
    check(
      'a combo with no components cannot be published',
      (await db.combo.findUnique({ where: { id: combo.id } }))?.isActive === false,
      await excerpt(page),
    );
  }

  await open(page, `/admin/combos/${combo.id}/items/new`);
  await fillAndSubmit(page, /add|create|save/i, { variantId: variant.id, quantity: '2' });
  const item = await eventually(() => db.comboItem.findFirst({ where: { comboId: combo.id } }));
  check('a component is added to the combo', item?.quantity === 2, await excerpt(page));

  if (item) {
    await open(page, `/admin/combos/${combo.id}/items/${item.id}`);
    await fillAndSubmit(page, /save/i, { quantity: '3' });
    const edited = await eventually(async () => {
      const row = await db.comboItem.findUnique({ where: { id: item.id } });
      return row?.quantity === 3 ? row : null;
    });
    check('a component quantity can be changed', Boolean(edited), await excerpt(page));

    await open(page, `/admin/combos/${combo.id}/items/new`);
    await fillAndSubmit(page, /add|create|save/i, { variantId: variant.id, quantity: '0' });
    check('a component with quantity 0 is refused', (await db.comboItem.count({ where: { comboId: combo.id } })) === 1);
  }

  await open(page, `/admin/combos/${combo.id}`);
  await fillAndSubmit(page, /save changes/i, { priceRupees: '249.50' });
  const repriced = await eventually(async () => {
    const row = await db.combo.findUnique({ where: { id: combo.id } });
    return row?.pricePaise === 24950 ? row : null;
  });
  check('a combo price edit is saved as 24950 paise', Boolean(repriced), await excerpt(page));
  checkQuiet(page, 'combos');
}

async function discountsSection(page: Page) {
  section('Discounts');

  const create = async (values: Record<string, FieldValue>) => {
    await open(page, '/admin/discounts/new');
    // The value fields only exist once a type is chosen, so choose it first.
    await page.selectOption('[name="type"]', values.type as string);
    await page.selectOption('[name="scope"]', values.scope as string);
    await page.waitForTimeout(200);
    await fillAndSubmit(page, /create discount/i, values);
  };

  await create({ name: `${P} Ten percent`, code: `${P}10`, type: 'PERCENTAGE', scope: 'ORDER', valuePercent: '10' });
  const percent = await eventually(() => db.discount.findFirst({ where: { name: `${P} Ten percent` } }));
  check('a percentage discount is created', Boolean(percent), await excerpt(page));
  check('10% is stored as 1000 basis points', percent?.valueBps === 1000, percent?.valueBps);
  check('...and audited', percent ? (await auditCount('Discount', percent.id)) >= 1 : false);

  await create({ name: `${P} Too much`, code: `${P}150`, type: 'PERCENTAGE', scope: 'ORDER', valuePercent: '150' });
  check('a discount over 100% is refused', !(await db.discount.findFirst({ where: { name: `${P} Too much` } })), await excerpt(page));

  await create({ name: `${P} Fifty off`, code: `${P}50`, type: 'FIXED_AMOUNT', scope: 'ORDER', valueRupees: '50', minOrderRupees: '500' });
  const fixed = await eventually(() => db.discount.findFirst({ where: { name: `${P} Fifty off` } }));
  check('a fixed-amount discount is created', Boolean(fixed), await excerpt(page));
  check('Rs 50 off is stored as 5000 paise', fixed?.valuePaise === 5000, fixed?.valuePaise);
  check('Rs 500 minimum is stored as 50000 paise', fixed?.minOrderPaise === 50000, fixed?.minOrderPaise);

  await create({ name: `${P} Same code`, code: `${P}10`, type: 'PERCENTAGE', scope: 'ORDER', valuePercent: '5' });
  check('a duplicate code is refused', !(await db.discount.findFirst({ where: { name: `${P} Same code` } })), await excerpt(page));

  await create({ name: `${P} Free delivery`, type: 'FREE_SHIPPING', scope: 'ORDER', minOrderRupees: '999' });
  const shipping = await eventually(() => db.discount.findFirst({ where: { name: `${P} Free delivery` } }));
  check('a free-delivery discount with no code is created', Boolean(shipping) && shipping?.code === null, await excerpt(page));

  if (percent) {
    await open(page, '/admin/discounts');
    await clickInRow(page, `${P} Ten percent`, /deactivate|pause|turn off/i);
    const off = await eventually(async () => {
      const row = await db.discount.findUnique({ where: { id: percent.id } });
      return row && !row.isActive ? row : null;
    });
    check('a discount can be switched off from the list', Boolean(off), await excerpt(page));

    await open(page, `/admin/discounts/${percent.id}`);
    check(
      'the discount detail page opens with its saved values',
      (await page.inputValue('[name="name"]').catch(() => '')) === `${P} Ten percent`,
      await excerpt(page),
    );
  }
  checkQuiet(page, 'discounts');
}

// ---------- stock, orders, reviews ----------

async function inventorySection(page: Page) {
  section('Stock');

  const variant = await db.productVariant.findUnique({ where: { sku: `${P}-SKU-1` } });
  if (!variant) {
    check('stock needs the test variant', false, 'run the products section first');
    return;
  }
  const location = await db.location.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } });
  if (!location) {
    check('stock needs a location', false);
    return;
  }

  await open(page, `/admin/inventory/${variant.id}`);
  const fields = await page.locator('form [name^="qty_"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).name));
  const field = fields.includes(`qty_${location.id}`) ? location.id : fields[0]?.slice(4);
  check('the stock form lists a quantity per location', fields.length > 0, fields);
  if (!field) return;

  await fillAndSubmit(page, /save stock/i, { [`qty_${field}`]: '40', [`low_${field}`]: '5' });
  const stocked = await eventually(async () => {
    const row = await db.inventory.findFirst({ where: { variantId: variant.id, locationId: field } });
    return row?.quantity === 40 ? row : null;
  });
  check('a stock count is saved', Boolean(stocked), await excerpt(page));
  check('...with its low-stock threshold', stocked?.lowStockAt === 5, stocked?.lowStockAt);
  check('...and audited', (await db.auditLog.count({ where: { entityType: { in: ['Inventory', 'ProductVariant'] }, createdAt: { gte: runStartedAt } } })) >= 1);

  await open(page, `/admin/inventory/${variant.id}`);
  await fillAndSubmit(page, /save stock/i, { [`qty_${field}`]: '-5' });
  const after = await db.inventory.findFirst({ where: { variantId: variant.id, locationId: field } });
  check('a negative stock count is refused', after?.quantity === 40, after?.quantity);

  await open(page, `/admin/inventory/${variant.id}`);
  await fillAndSubmit(page, /save stock/i, { [`qty_${field}`]: 'lots' });
  const still = await db.inventory.findFirst({ where: { variantId: variant.id, locationId: field } });
  check('a stock count that is not a number is refused', still?.quantity === 40, still?.quantity);

  await open(page, '/admin/inventory?show=attention');
  await open(page, `/admin/inventory?q=${P}`);
  check('the stock list finds the variant by search', (await pageText(page)).includes('Test Lemon'), await excerpt(page));
  checkQuiet(page, 'stock');
}

async function ordersSection(page: Page) {
  section('Orders');

  const variant = await db.productVariant.findUnique({ where: { sku: `${P}-SKU-1` }, include: { product: true } });
  if (!variant) {
    check('orders need the test variant', false, 'run the products and stock sections first');
    return;
  }
  // The image upload is tested on its own; here the product only has to be sellable.
  await db.product.update({ where: { id: variant.productId }, data: { isActive: true, hsnCode: '3402', gstRate: 1800 } });
  await db.productVariant.update({ where: { id: variant.id }, data: { isActive: true, pricePaise: 14950 } });

  const { placeOrder } = await import('@/lib/orders');
  const placed = await placeOrder({
    lines: [{ kind: 'VARIANT', id: variant.id, quantity: 2 }],
    phone: '9847012345',
    email: 'e2e@example.com',
    paymentMethod: 'COD',
    shipping: {
      fullName: 'E2E Tester',
      phone: '9847012345',
      line1: '12 Test Road',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001',
    },
    notes: `${P} admin order`,
  });
  check('a COD order can be placed for the test product', placed.ok, placed.ok ? undefined : placed.error);
  if (!placed.ok) return;
  const order = placed.order;

  await open(page, '/admin/orders');
  check('the new order is on the orders list', (await pageText(page)).includes(order.orderNumber));
  await open(page, `/admin/orders?q=${order.orderNumber}`);
  check('...and is found by search', (await pageText(page)).includes(order.orderNumber));
  await open(page, '/admin/orders?status=CONFIRMED');
  check('...and by status filter', (await pageText(page)).includes(order.orderNumber));

  await open(page, `/admin/orders/${order.id}`);
  const text = await pageText(page);
  check('the order page shows the customer and the line', text.includes('E2E Tester') && text.includes('Test Lemon'), await excerpt(page));
  check('money on the order page is formatted in rupees', /₹\s?[\d,]+\.\d{2}/.test(text) && !/₹\s?0\.00\b.*Total/i.test(text));
  check('the order page never shows a NaN or undefined', !/\bNaN\b|undefined|\[object Object\]/.test(text));
  checkQuiet(page, 'order detail');

  // The invoice, as the signed-in member of staff.
  const invoice = await page.request.get(`${BASE}/api/invoice/${order.orderNumber}`);
  const bytes = await invoice.body();
  check('the invoice downloads as a PDF', invoice.status() === 200 && bytes.subarray(0, 5).toString('latin1') === '%PDF-', {
    status: invoice.status(),
    type: invoice.headers()['content-type'],
    start: bytes.subarray(0, 60).toString('latin1'),
  });

  // Walk the order through fulfilment with the buttons the page offers.
  const statusOf = async () => (await db.order.findUnique({ where: { id: order.id } }))?.status;
  for (const next of ['PACKED', 'SHIPPED', 'DELIVERED'] as const) {
    await open(page, `/admin/orders/${order.id}`);
    const button = page.getByRole('button', { name: new RegExp(`^mark ${next.toLowerCase()}$`, 'i') }).first();
    if (!(await button.count())) {
      const offered = await page.getByRole('button').allInnerTexts();
      check(`the order page offers "Mark ${next.toLowerCase()}"`, false, { status: await statusOf(), offered });
      break;
    }
    await act(page, () => button.click());
    const moved = await eventually(async () => ((await statusOf()) === next ? next : null));
    check(`the order moves to ${next}`, moved === next, { status: await statusOf(), page: await excerpt(page) });
    if (moved !== next) break;
  }
  checkQuiet(page, 'order transitions');

  await open(page, `/admin/orders/${order.id}`);
  const offered = (await page.getByRole('button').allInnerTexts()).map((label) => label.toLowerCase());
  check(
    'a delivered order cannot be marked packed or cancelled',
    !offered.some((label) => /mark packed|mark cancelled|mark confirmed/.test(label)),
    offered,
  );
  check(
    'every status change was audited',
    (await db.auditLog.count({ where: { entityType: 'Order', entityId: order.id } })) >= 3,
    await db.auditLog.count({ where: { entityType: 'Order', entityId: order.id } }),
  );

  // Reports must count it.
  await open(page, '/admin/reports?days=7');
  check('the reports page renders with orders in range', /₹/.test(await pageText(page)) && !/\bNaN\b/.test(await pageText(page)), await excerpt(page));
  for (const days of [30, 90, 365]) await open(page, `/admin/reports?days=${days}`);
  checkQuiet(page, 'reports');
}

async function reviewsSection(page: Page) {
  section('Reviews');

  const product = await db.product.findUnique({ where: { slug: `${SLUG}-product` } });
  if (!product) {
    check('reviews need the test product', false, 'run the products section first');
    return;
  }
  const review = await db.review.create({
    data: { productId: product.id, authorName: `${P} Reviewer`, rating: 4, title: 'Works', body: 'Written by the test run.' },
  });

  await open(page, '/admin/reviews?show=waiting');
  check('a new review waits for approval', (await pageText(page)).includes(`${P} Reviewer`), await excerpt(page));

  await clickInRow(page, `${P} Reviewer`, /approve|publish/i);
  const approved = await eventually(async () => {
    const row = await db.review.findUnique({ where: { id: review.id } });
    return row?.isApproved ? row : null;
  });
  check('a review can be approved', Boolean(approved), await excerpt(page));

  await open(page, '/admin/reviews?show=published');
  await clickInRow(page, `${P} Reviewer`, /unpublish|hide|unapprove/i);
  const hidden = await eventually(async () => {
    const row = await db.review.findUnique({ where: { id: review.id } });
    return row && !row.isApproved ? row : null;
  });
  check('a published review can be taken down again', Boolean(hidden), await excerpt(page));

  await open(page, '/admin/reviews?show=all');
  page.once('dialog', (dialog) => dialog.accept());
  await clickInRow(page, `${P} Reviewer`, /delete|remove/i);
  const gone = await eventually(async () => ((await db.review.findUnique({ where: { id: review.id } })) ? null : true));
  check('a review can be deleted', Boolean(gone), await excerpt(page));
  checkQuiet(page, 'reviews');
}

// ---------- content and settings ----------

async function contentSection(page: Page) {
  section('Content and policies');

  const before = await db.contentBlock.findUnique({ where: { key: 'announcement_bar' } });
  const line = `${P} announcement ${Date.now()}`;

  await open(page, '/admin/content/announcement_bar');
  const original = await page.inputValue('[name="items"]');
  await fillAndSubmit(page, /^save$/i, { items: `${line}\nSecond line` });
  const saved = await eventually(async () => {
    const row = await db.contentBlock.findUnique({ where: { key: 'announcement_bar' } });
    return JSON.stringify(row?.data ?? '').includes(line) ? row : null;
  });
  check('the announcement bar is saved', Boolean(saved), await excerpt(page));

  await open(page, '/');
  check('...and shows on the storefront straight away', await sees(page, new RegExp(line, 'i')), await excerpt(page));

  await open(page, '/admin/content/announcement_bar');
  await fillAndSubmit(page, /^save$/i, { items: '' });
  const kept = await db.contentBlock.findUnique({ where: { key: 'announcement_bar' } });
  check('an empty announcement bar is refused', JSON.stringify(kept?.data ?? '').includes(line), await excerpt(page));

  // Put it back exactly as it was.
  if (before) {
    await db.contentBlock.update({ where: { key: 'announcement_bar' }, data: { data: before.data ?? {}, isActive: before.isActive } });
  } else {
    await open(page, '/admin/content/announcement_bar');
    const revert = page.getByRole('button', { name: /default|revert|reset/i }).first();
    if (await revert.count()) await act(page, () => revert.click());
    else await fillAndSubmit(page, /^save$/i, { items: original });
    await db.contentBlock.deleteMany({ where: { key: 'announcement_bar' } });
  }

  for (const key of ['home_hero', 'world_record', 'trust_badges', 'home_story']) {
    const status = await open(page, `/admin/content/${key}`);
    check(`the ${key} editor opens`, status === 200);
    const hadRow = await db.contentBlock.findUnique({ where: { key } });
    // Saving the form unchanged must be accepted: the defaults have to be valid input.
    const save = page.getByRole('button', { name: /^save$/i }).first();
    await act(page, () => save.click());
    check(`the ${key} editor accepts its own current values`, !/check the|invalid|required/i.test(await pageText(page)), await excerpt(page));
    if (!hadRow) await db.contentBlock.deleteMany({ where: { key } });
  }
  checkQuiet(page, 'content editors');

  // A policy page: published means reachable, unpublished means a real 404.
  const policyBefore = await db.contentBlock.findUnique({ where: { key: 'policy_terms' } });
  await open(page, '/admin/content/policy_terms');
  await fillAndSubmit(page, /^publish$/i, { title: `${P} Terms`, body: 'First paragraph.\n\nSecond paragraph.' });
  const policy = await eventually(() => db.contentBlock.findUnique({ where: { key: 'policy_terms' } }));
  check('a policy can be published', Boolean(policy?.isActive), await excerpt(page));
  check('...and its page is live', (await open(page, '/policies/terms')) === 200 && (await pageText(page)).includes(`${P} Terms`));

  await open(page, '/admin/content/policy_terms');
  const unpublish = page.getByRole('button', { name: /unpublish/i }).first();
  if (await unpublish.count()) {
    await act(page, () => unpublish.click());
    check('an unpublished policy is a 404 again', (await open(page, '/policies/terms')) === 404);
  } else {
    check('a published policy offers "Unpublish"', false, await excerpt(page));
  }
  drainNoise(page);
  if (policyBefore) {
    await db.contentBlock.update({ where: { key: 'policy_terms' }, data: { data: policyBefore.data ?? {}, isActive: policyBefore.isActive } });
  } else {
    await db.contentBlock.deleteMany({ where: { key: 'policy_terms' } });
  }
}

async function settingsSection(page: Page) {
  section('Settings');

  const snapshot = await db.setting.findMany();
  try {
    await open(page, '/admin/settings');
    await fillAndSubmit(page, /save cod settings/i, { enabled: true, feeRupees: '35', minOrderRupees: '0', maxOrderRupees: '5000', pincodeAllowlist: '68\n69' });
    const cod = await eventually(async () => {
      const row = await db.setting.findUnique({ where: { key: 'checkout_cod' } });
      return (row?.data as { feePaise?: number } | null)?.feePaise === 3500 ? row : null;
    });
    check('COD settings are saved, Rs 35 as 3500 paise', Boolean(cod), await excerpt(page));
    check('...Rs 5000 maximum as 500000 paise', (cod?.data as { maxOrderPaise?: number } | null)?.maxOrderPaise === 500000, cod?.data);

    await open(page, '/admin/settings');
    await fillAndSubmit(page, /save cod settings/i, { feeRupees: 'thirty' });
    const codAfter = await db.setting.findUnique({ where: { key: 'checkout_cod' } });
    check('a COD fee that is not a number is refused', (codAfter?.data as { feePaise?: number } | null)?.feePaise === 3500, codAfter?.data);

    await open(page, '/admin/settings');
    await fillAndSubmit(page, /save cod settings/i, { pincodeAllowlist: 'kochi' });
    const codPins = await db.setting.findUnique({ where: { key: 'checkout_cod' } });
    check('a pincode list with letters in it is refused', JSON.stringify(codPins?.data).includes('"68"'), codPins?.data);

    // Delivery slabs: the first two rows of the table.
    await open(page, '/admin/settings');
    const grams = page.locator('[name="slabUptoGrams"]');
    const prices = page.locator('[name="slabPriceRupees"]');
    await grams.nth(0).fill('1000');
    await prices.nth(0).fill('65');
    await grams.nth(1).fill('5000');
    await prices.nth(1).fill('125');
    await fillAndSubmit(page, /save delivery rates/i, { overflowPriceRupees: '210', defaultUnitGrams: '500' });
    const shipping = await eventually(async () => {
      const row = await db.setting.findUnique({ where: { key: 'shipping_rates' } });
      const slabs = (row?.data as { slabs?: Array<{ pricePaise: number }> } | null)?.slabs;
      return slabs?.[0]?.pricePaise === 6500 ? row : null;
    });
    check('delivery slabs are saved, Rs 65 as 6500 paise', Boolean(shipping), await excerpt(page));
    check('...overflow Rs 210 as 21000 paise', (shipping?.data as { overflowPricePaise?: number } | null)?.overflowPricePaise === 21000, shipping?.data);

    await open(page, '/admin/settings');
    await grams.nth(0).fill('5000');
    await grams.nth(1).fill('1000');
    await fillAndSubmit(page, /save delivery rates/i, {});
    const order = await db.setting.findUnique({ where: { key: 'shipping_rates' } });
    const slabs = (order?.data as { slabs?: Array<{ uptoGrams: number }> } | null)?.slabs ?? [];
    check(
      'slabs entered out of order are saved lightest first',
      slabs.every((slab, index) => index === 0 || slab.uptoGrams > slabs[index - 1].uptoGrams),
      slabs,
    );

    await open(page, '/admin/settings');
    await fillAndSubmit(page, /save shiprocket settings/i, { originPincode: '12' });
    const origin = await db.setting.findUnique({ where: { key: 'shipping_rates' } });
    check('a two-digit origin pincode is refused', (origin?.data as { originPincode?: string } | null)?.originPincode !== '12', origin?.data);

    // Seller of record: saving the current choice must work, and a bad GSTIN must not.
    const seller = await db.entity.findFirst({ where: { isSeller: true } });
    if (seller) {
      await open(page, '/admin/settings');
      await fillAndSubmit(page, /save seller of record/i, { entityId: seller.id, gstin: 'NOT-A-GSTIN' });
      const sellerAfter = await db.entity.findUnique({ where: { id: seller.id } });
      check('a malformed GSTIN is refused', sellerAfter?.gstin === seller.gstin, sellerAfter?.gstin);
      check('...and there is still exactly one seller of record', (await db.entity.count({ where: { isSeller: true } })) === 1);
    }
    checkQuiet(page, 'settings');

    // Checkout must reflect what the admin just saved.
    await open(page, '/checkout');
    drainNoise(page);
  } finally {
    await db.setting.deleteMany({});
    for (const row of snapshot) {
      await db.setting.create({ data: { id: row.id, key: row.key, data: row.data ?? {} } });
    }
  }
}

// ---------- server-side enforcement ----------

/**
 * Hiding a button is not access control (CLAUDE.md). A form opened by someone
 * who was allowed to see it is submitted after their role has been lowered,
 * and then after their account has been switched off. Both must be refused by
 * the server action itself, with nothing written.
 */
async function enforcementSection(browser: Browser) {
  section('Server-side enforcement');

  const manager = await db.user.findUnique({ where: { email: ACCOUNTS.MANAGER.email } });
  const brand = await db.brand.findFirst({ where: { slug: `${SLUG}-brand` } });
  if (!manager || !brand) {
    check('enforcement needs the manager account and the test brand', false);
    return;
  }

  const { context, page } = await contextFor(browser, 'MANAGER');
  try {
    await open(page, `/admin/brands/${brand.id}`);
    await page.fill('[name="tagline"]', 'Written by a demoted manager');
    await db.user.update({ where: { id: manager.id }, data: { role: 'STAFF' } });
    await act(page, () => page.getByRole('button', { name: /save changes/i }).first().click());
    const afterDemotion = await db.brand.findUnique({ where: { id: brand.id } });
    check(
      'a catalogue edit submitted after demotion to STAFF is refused',
      afterDemotion?.tagline !== 'Written by a demoted manager',
      afterDemotion?.tagline,
    );
    drainNoise(page);

    await db.user.update({ where: { id: manager.id }, data: { role: 'MANAGER' } });
    await open(page, `/admin/brands/${brand.id}`);
    await page.fill('[name="tagline"]', 'Written by a deactivated manager');
    await db.user.update({ where: { id: manager.id }, data: { isActive: false } });
    await act(page, () => page.getByRole('button', { name: /save changes/i }).first().click());
    const afterDeactivation = await db.brand.findUnique({ where: { id: brand.id } });
    check(
      'a catalogue edit submitted after the account is switched off is refused',
      afterDeactivation?.tagline !== 'Written by a deactivated manager',
      afterDeactivation?.tagline,
    );
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    check('...and that session can no longer open the admin', new URL(page.url()).pathname === '/admin/login', page.url());
    drainNoise(page);
  } finally {
    await db.user.update({ where: { id: manager.id }, data: { role: 'MANAGER', isActive: true } });
    await context.close();
  }

  // STAFF must not be shown prices anywhere they can reach.
  const staff = await contextFor(browser, 'STAFF');
  try {
    await open(staff.page, '/admin');
    const nav = await staff.page.locator('nav').first().innerText();
    check('STAFF navigation has no catalogue, pricing or settings links', !/products|offers|combos|settings|reports/i.test(nav), nav.replace(/\s+/g, ' '));
    const invoiceOrder = await db.order.findFirst({ select: { orderNumber: true } });
    if (invoiceOrder) {
      const response = await staff.page.request.get(`${BASE}/api/invoice/${invoiceOrder.orderNumber}`);
      check('STAFF can download an invoice for an order they handle', response.status() === 200, response.status());
    }
  } finally {
    await staff.context.close();
  }

  // And nobody at all without a session.
  const anonymous = await browser.newContext();
  try {
    const someOrder = await db.order.findFirst({ select: { orderNumber: true } });
    if (someOrder) {
      const response = await anonymous.request.get(`${BASE}/api/invoice/${someOrder.orderNumber}`);
      check('an invoice is not served without a session or a signed link', response.status() === 404, response.status());
    }
  } finally {
    await anonymous.close();
  }
}

// ---------- layout ----------

/** Every admin page at desktop and phone width: nothing wider than the screen. */
async function layoutSection(browser: Browser) {
  section('Layout');
  const { routes } = await adminRoutes();

  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['phone', { width: 390, height: 844 }],
  ] as const) {
    const context = await browser.newContext({ viewport });
    const page = await newPage(context);
    await signIn(page, 'ADMIN');
    for (const route of routes) {
      await open(page, route.path);
      const overflow = (await page.evaluate(
        '(() => { const el = document.documentElement; return el.scrollWidth - el.clientWidth; })()',
      )) as number;
      check(`${label} ${route.path}: no horizontal overflow`, overflow <= 1, `${overflow}px wider than the screen`);
      const name = route.path.replace(/^\/admin\/?/, '').replace(/[^a-z0-9]+/gi, '-') || 'dashboard';
      await page.screenshot({ path: path.join(SHOTS, `${label}-${name.slice(0, 60)}.png`), fullPage: true }).catch(() => null);
    }
    drainNoise(page);
    await context.close();
  }
}

// ---------- product images ----------

/** A solid-colour PNG of the given size, built by hand so the test needs no image library. */
function solidPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = 0x0f;
    row[2 + x * 3] = 0x9c;
    row[3 + x * 3] = 0xd6;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Removes a stored object directly, for cleanup when the admin's own delete did not run. */
async function removeStoredObject(url: string): Promise<void> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const marker = '/storage/v1/object/public/';
  if (!base || !key || !url.startsWith(base) || !url.includes(marker)) return;
  const objectPath = url.slice(url.indexOf(marker) + marker.length);
  await fetch(`${base}/storage/v1/object/${objectPath}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => null);
}

async function imagesSection(page: Page) {
  section('Product images and publishing');

  const product = await db.product.findUnique({ where: { slug: `${SLUG}-product` } });
  if (!product) {
    check('images need the test product', false, 'run the products section first');
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('(skipped: Supabase Storage is not configured in this environment)');
    return;
  }

  const upload = async (name: string, file: Buffer, alt: string) => {
    await open(page, `/admin/products/${product.id}/images`);
    await page.fill('#imageAlt', alt);
    await page.setInputFiles('#imageFile', { name, mimeType: 'image/png', buffer: file });
    await page.getByRole('button', { name: /upload/i }).first().click();
  };

  await upload('small.png', solidPng(800, 800), `${P} too small`);
  await page.waitForTimeout(2500);
  check('an image under 2000px is refused', (await db.productImage.count({ where: { productId: product.id } })) === 0);
  check('...and the admin is told the size rule', await sees(page, /at least 2000px/i), await excerpt(page));

  await upload('good.png', solidPng(2000, 2000), '');
  await page.waitForTimeout(1500);
  check('an image with no alt text is refused', (await db.productImage.count({ where: { productId: product.id } })) === 0);

  await upload('good.png', solidPng(2000, 2000), `${P} product, front`);
  const image = await eventually(() => db.productImage.findFirst({ where: { productId: product.id } }), 45_000);
  check('a 2000px image uploads', Boolean(image), await excerpt(page));
  if (!image) return;
  const served = await fetch(image.url);
  check('...and is served from storage', served.status === 200 && (served.headers.get('content-type') ?? '').startsWith('image/'), served.status);
  check('...with its alt text', image.alt === `${P} product, front`, image.alt);
  checkQuiet(page, 'image upload');

  // Everything the publish guard asks for is now present.
  await open(page, '/admin/products');
  await clickInRow(page, `${P} Product`, /^publish$/i);
  const live = await eventually(async () => {
    const row = await db.product.findUnique({ where: { id: product.id } });
    return row?.isActive ? row : null;
  });
  check('a complete product can be published', Boolean(live), await excerpt(page));

  if (live) {
    await db.productVariant.updateMany({ where: { productId: product.id }, data: { isActive: true } });
    const status = await open(page, `/products/${SLUG}-product`);
    const text = await pageText(page);
    check('the published product has a storefront page', status === 200 && text.includes(`${P} Product`), status);
    check('...which never shows a price of zero', !/₹\s?0\.00/.test(text), text.match(/₹\s?[\d.,]+/g));
    check('...and shows "Price on request" for the variant with no price', /price on request/i.test(text) || /₹\s?19\.99/.test(text), text.slice(0, 400));
    checkQuiet(page, 'storefront product page');

    await open(page, '/admin/products');
    await clickInRow(page, `${P} Product`, /unpublish|deactivate/i);
    const off = await eventually(async () => {
      const row = await db.product.findUnique({ where: { id: product.id } });
      return row && !row.isActive ? row : null;
    });
    check('a product can be unpublished', Boolean(off), await excerpt(page));
    check('...and its storefront page is then a 404', (await open(page, `/products/${SLUG}-product`)) === 404);
    drainNoise(page);
  }

  await open(page, `/admin/products/${product.id}/images`);
  page.once('dialog', (dialog) => dialog.accept());
  const remove = page.getByRole('button', { name: /delete|remove/i }).first();
  if (await remove.count()) {
    await act(page, () => remove.click());
    const gone = await eventually(async () => ((await db.productImage.findUnique({ where: { id: image.id } })) ? null : true));
    check('an image can be deleted', Boolean(gone), await excerpt(page));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const after = await fetch(`${image.url}?cachebust=${Date.now()}`);
    check('...and its file leaves storage', after.status >= 400, after.status);
  } else {
    check('the image card offers a delete control', false, await page.getByRole('button').allInnerTexts());
  }
  checkQuiet(page, 'image delete');
}

/** Runs one section; a crash in it is a failure of that section, not of the run. */
async function run(name: string, body: () => Promise<void>): Promise<void> {
  if (!wants(name)) return;
  try {
    await body();
  } catch (error) {
    const message = error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error);
    check(`${name}: the section ran to the end`, false, message);
  }
}

// ---------- the one write allowed on a hosted site ----------

/**
 * `--live-edit`: proves an admin edit reaches the storefront through the real
 * page cache, then puts it back. The announcement bar is used because it is
 * on every page, harmless to change for a minute, and has a "back to default".
 */
async function liveEditSection(browser: Browser) {
  section('Live edit reaches the storefront');
  const { context, page } = await contextFor(browser, 'ADMIN');
  const visitor = await browser.newContext();
  const shop = await newPage(visitor);
  const marker = `Cache check ${Date.now()}`;

  /** How long until `pathname` does (or does not) contain the marker; null if it never does. */
  const waitFor = async (pathname: string, present: boolean, ms: number): Promise<number | null> => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      await shop.goto(`${BASE}${pathname}`, { waitUntil: 'domcontentloaded' }).catch(() => null);
      const has = (await pageText(shop).catch(() => '')).toLowerCase().includes(marker.toLowerCase());
      if (has === present) return Date.now() - started;
      await shop.waitForTimeout(4000);
    }
    return null;
  };
  const seconds = (ms: number | null) => (ms === null ? 'never' : `${Math.round(ms / 1000)}s`);

  try {
    await open(page, '/admin/content/announcement_bar');
    const original = await page.inputValue('[name="items"]');
    const hadSavedRow = Boolean(await db.contentBlock.findUnique({ where: { key: 'announcement_bar' } }));

    await fillAndSubmit(page, /^save$/i, { items: `${marker}\n${original}` });
    // The home page is rendered per request; /story is a cached page. They
    // exercise different paths, so they are timed separately.
    const onHome = await waitFor('/', true, 60_000);
    check('an admin edit appears on the home page', onHome !== null, 'not visible after 1 minute');
    const onCached = await waitFor('/story', true, 300_000);
    check('...and on a cached page', onCached !== null, 'not visible after 5 minutes');
    console.log(`      (home page after ${seconds(onHome)}, cached page after ${seconds(onCached)})`);

    // Put it back: the default if there was nothing saved, the old text otherwise.
    await open(page, '/admin/content/announcement_bar');
    const forms = page.locator('main form');
    const revert = forms.nth((await forms.count()) - 1).getByRole('button').first();
    if (!hadSavedRow && (await forms.count()) > 1) {
      await act(page, () => revert.click());
    } else {
      await fillAndSubmit(page, /^save$/i, { items: original });
    }
    const offHome = await waitFor('/', false, 60_000);
    const offCached = await waitFor('/story', false, 300_000);
    check('restoring it removes the test line from the home page', offHome !== null, 'still visible after 1 minute');
    check('...and from the cached page', offCached !== null, 'still visible after 5 minutes');
    console.log(`      (home page after ${seconds(offHome)}, cached page after ${seconds(offCached)})`);
    // "Back to default" switches the saved block off rather than deleting it.
    const row = await db.contentBlock.findUnique({ where: { key: 'announcement_bar' } });
    check(
      '...and the test line is no longer live content',
      !row || !row.isActive || !JSON.stringify(row.data).includes(marker),
      row,
    );
    if (!hadSavedRow && row && JSON.stringify(row.data).includes(marker)) {
      await db.contentBlock.delete({ where: { key: 'announcement_bar' } });
    }
    checkQuiet(page, 'live edit');
  } finally {
    await visitor.close();
    await context.close();
  }
}

// ---------- main ----------

function assertSafeTarget() {
  if (READ_ONLY) return;
  const url = new URL(process.env.DATABASE_URL ?? '');
  const local = ['localhost', '127.0.0.1', 'bbtc-postgres'].includes(url.hostname);
  if (!local) {
    throw new Error(
      `Refusing to run: this writes test rows, and DATABASE_URL points at ${url.hostname}. Use --read-only for a hosted site.`,
    );
  }
}

async function main() {
  assertSafeTarget();
  await mkdir(SHOTS, { recursive: true });
  console.log(`Admin e2e against ${BASE}${READ_ONLY ? ' (read-only)' : ''}`);

  const browser = await chromium.launch();
  try {
    if (DISCOVER) {
      await discover(browser);
      return;
    }
    // Rows a crashed run left behind would otherwise be opened by the access
    // matrix and then deleted from under it.
    if (!READ_ONLY) await cleanup();
    await run('access', () => accessSection(browser));
    if (READ_ONLY && process.argv.includes('--live-edit')) await run('live-edit', () => liveEditSection(browser));

    if (!READ_ONLY) {
      await cleanup();
      const { context, page } = await contextFor(browser, 'ADMIN');
      try {
        await run('brands', () => brandsSection(page));
        await run('categories', () => categoriesSection(page));
        await run('products', () => productsSection(page));
        await run('images', () => imagesSection(page));
        await run('retailers', () => retailersSection(page));
        await run('combos', () => combosSection(page));
        await run('discounts', () => discountsSection(page));
        await run('inventory', () => inventorySection(page));
        await run('orders', () => ordersSection(page));
        await run('reviews', () => reviewsSection(page));
        await run('content', () => contentSection(page));
        await run('settings', () => settingsSection(page));
        // <sections>
        await context.close();
        await run('enforcement', () => enforcementSection(browser));
        await run('layout', () => layoutSection(browser));
      } finally {
        await context.close().catch(() => null);
        if (!process.argv.includes('--keep')) await cleanup();
      }
    }
  } finally {
    await browser.close();
    await db.$disconnect();
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (problems.length) {
    console.log('\nFailures:');
    for (const line of problems) console.log(line);
  } else {
    console.log('ALL PASSED');
  }
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
