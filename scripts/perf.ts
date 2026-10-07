/*
  Phone performance, measured the way a mid-range Android on a weak signal sees it.

    pnpm build:next && pnpm start        # a production server; dev bundles are unminified
    pnpm qa:perf [label]            # another terminal

  Each page is loaded cold, three times, in Chromium emulating a Pixel 7 with
  the CPU slowed 4× and the network throttled to "slow 4G" (the profile
  Lighthouse's mobile run uses: 150 ms RTT, ~1.6 Mbps down). Reported per page,
  as the median of the three:

    - LCP — when the largest thing on screen painted. Target under 2.5 s.
    - CLS — how much the layout jumped. Target under 0.1.
    - TBT — main-thread time blocked by long tasks before the page settled;
            what makes a tap feel ignored. Target under 200 ms.
    - JS  — script bytes transferred (compressed, as Chrome counts them).

  No Lighthouse dependency: the same metrics come straight from the browser's
  own PerformanceObserver entries. Results go to `qa/perf-<label>.txt`.
*/

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgPoolConfig } from '../src/lib/pg-config';
import { PrismaClient } from '../src/generated/prisma/client';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env present, or already loaded.
}

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:3000';
const RUNS = 3;
const label = process.argv[2] ?? 'before';

/** Collected in the page from first paint; read back once the page is quiet. */
const OBSERVE_SCRIPT = `(() => {
  window.__perf = { lcp: 0, cls: 0, tbt: 0 };
  const observe = (type, fn) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch {}
  };
  observe('largest-contentful-paint', (e) => { window.__perf.lcp = e.startTime; });
  observe('layout-shift', (e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; });
  observe('longtask', (e) => { window.__perf.tbt += Math.max(0, e.duration - 50); });
})()`;

type Sample = { lcp: number; cls: number; tbt: number; jsKb: number };

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pgPoolConfig(process.env.DATABASE_URL ?? '')),
  });
  const [product, variant] = await Promise.all([
    prisma.product.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.productVariant.findFirst({
      where: { isActive: true, pricePaise: { not: null }, product: { isActive: true, hsnCode: { not: null } } },
      select: { id: true },
    }),
  ]);
  await prisma.$disconnect();

  const pages = [
    { name: 'home', url: '/' },
    { name: 'shop', url: '/shop' },
    ...(product ? [{ name: 'product', url: `/products/${product.slug}` }] : []),
    { name: 'checkout', url: '/checkout', cart: true },
  ];

  const browser = await chromium.launch();
  const lines: string[] = [
    `Pixel 7 · 4× CPU slowdown · slow 4G · median of ${RUNS} cold loads · ${BASE_URL}`,
    '',
    'page        LCP      CLS     TBT      JS',
  ];

  for (const target of pages) {
    const samples: Sample[] = [];
    for (let run = 0; run < RUNS; run++) {
      const context = await browser.newContext(devices['Pixel 7']);
      await context.addInitScript(OBSERVE_SCRIPT);
      if (target.cart && variant) {
        const value = JSON.stringify({
          state: { lines: [{ kind: 'VARIANT', id: variant.id, quantity: 1 }], discountCode: null },
          version: 2,
        });
        await context.addInitScript(`try { localStorage.setItem('bb-cart', ${JSON.stringify(value)}); } catch {}`);
      }
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      // Bytes on the wire, as Chrome counts them: `content-length` is absent
      // on compressed responses, so headers alone under-count badly.
      let jsBytes = 0;
      const scriptRequests = new Set<string>();
      cdp.on('Network.responseReceived', (event) => {
        if (event.type === 'Script') scriptRequests.add(event.requestId);
      });
      cdp.on('Network.loadingFinished', (event) => {
        if (scriptRequests.has(event.requestId)) jsBytes += event.encodedDataLength;
      });

      await page.goto(`${BASE_URL}${target.url}`, { waitUntil: 'networkidle', timeout: 120_000 });
      await page.waitForTimeout(1500);
      const perf = (await page.evaluate('window.__perf')) as { lcp: number; cls: number; tbt: number };
      samples.push({ ...perf, jsKb: jsBytes / 1024 });
      await context.close();
    }

    const lcp = median(samples.map((s) => s.lcp)) / 1000;
    const cls = median(samples.map((s) => s.cls));
    const tbt = median(samples.map((s) => s.tbt));
    const js = median(samples.map((s) => s.jsKb));
    const row =
      target.name.padEnd(12) +
      `${lcp.toFixed(2)} s`.padEnd(9) +
      cls.toFixed(3).padEnd(8) +
      `${Math.round(tbt)} ms`.padEnd(9) +
      `${Math.round(js)} kB`;
    lines.push(row);
    console.log(row);
  }

  await browser.close();
  const out = path.join(process.cwd(), 'qa', `perf-${label}.txt`);
  await writeFile(out, lines.join('\n') + '\n');
  console.log(`\nWritten to ${path.relative(process.cwd(), out)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
