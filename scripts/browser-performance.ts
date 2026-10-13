/** Bounded read-only browser performance measurements; never submits an order. */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

const origin = new URL(process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000');
if (!['localhost', '127.0.0.1', '[::1]', 'brightbluefmcg.com'].includes(origin.hostname) || origin.username || origin.password) throw new Error('Use the isolated local server or the authorised Bright Blue store.');
const productPath = process.env.QA_PRODUCT_PATH;
if (productPath && !/^\/products\/[a-z0-9-]+$/.test(productPath)) throw new Error('Invalid product path');
const paths = ['/', '/shop', ...(productPath ? [productPath] : [])];
const label = origin.hostname === 'brightbluefmcg.com' ? 'hosted' : 'isolated';
type Sample = { path: string; profile: string; run: number; status: number; ttfbMs: number; lcpMs: number; cls: number; blockingMs: number; scriptBytes: number; authCookie: boolean; errors: string[] };

async function main() {
  const browser = await chromium.launch();
  const samples: Sample[] = [];
  try {
    for (const profile of ['desktop', 'mobile']) {
      for (const path of paths) {
        for (let run = 1; run <= 3; run++) {
          const context = await browser.newContext(profile === 'mobile' ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 } });
          try {
            await context.addInitScript(() => {
              const stats = { lcpMs: 0, cls: 0, blockingMs: 0 };
              Object.assign(window, { __bbPerf: stats });
              for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
                new PerformanceObserver((list) => {
                  for (const raw of list.getEntries()) {
                    const entry = raw as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
                    if (type === 'largest-contentful-paint') stats.lcpMs = entry.startTime;
                    if (type === 'layout-shift' && !entry.hadRecentInput) stats.cls += entry.value ?? 0;
                    if (type === 'longtask') stats.blockingMs += Math.max(0, entry.duration - 50);
                  }
                }).observe({ type, buffered: true });
              }
            });
            const page = await context.newPage();
            const cdp = await context.newCDPSession(page);
            await cdp.send('Network.enable');
            await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
            if (profile === 'mobile') {
              await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
              await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
            }
            let scriptBytes = 0;
            const scripts = new Set<string>();
            cdp.on('Network.responseReceived', (event) => { if (event.type === 'Script') scripts.add(event.requestId); });
            cdp.on('Network.loadingFinished', (event) => { if (scripts.has(event.requestId)) scriptBytes += event.encodedDataLength; });
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(error.message.slice(0, 180)));
            const response = await page.goto(new URL(path, origin).href, { waitUntil: 'load', timeout: 60000 });
            await page.waitForTimeout(2000);
            const metrics = await page.evaluate(() => {
              const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
              const stats = (window as unknown as { __bbPerf: { lcpMs: number; cls: number; blockingMs: number } }).__bbPerf;
              return { ...stats, ttfbMs: navigation.responseStart - navigation.startTime };
            });
            const status = response?.status() ?? 0;
            const authCookie = (await context.cookies()).some((cookie) => cookie.name.includes('authjs'));
            samples.push({ path, profile, run, status, ...metrics, scriptBytes, authCookie, errors });
            console.log(JSON.stringify(samples.at(-1)));
          } finally { await context.close(); }
        }
      }
    }
  } finally {
    await browser.close();
    await mkdir('qa', { recursive: true });
    await writeFile(`qa/performance-${label}.json`, JSON.stringify({ label, revision: process.env.PERFORMANCE_REVISION ?? 'live', origin: origin.origin, measuredAt: new Date().toISOString(), note: '3 cold loads per path/profile; mobile 4x CPU, 150ms RTT, 1.6Mbps. Blocking time is observed long-task excess during the sample, not Lighthouse TBT or field INP. No purchase or admin mutation.', samples }, null, 2));
  }
  if (samples.some((sample) => sample.status !== 200 || sample.lcpMs <= 0 || sample.errors.length)) throw new Error('A measured page failed to render correctly; inspect the recorded samples.');
  if (label === 'isolated' && process.env.PERFORMANCE_REVISION !== 'baseline' && samples.some((sample) => sample.authCookie)) throw new Error('Public browsing created auth cookies');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Performance check failed'); process.exitCode = 1; });
