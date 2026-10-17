/** Isolated production-build visual checks; no credentials or checkout calls. */
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

async function main() {
  const base = new URL(process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000');
  if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Local QA only');
  await mkdir('qa/screenshots/storefront', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const response = await page.goto(base.href, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.colour-hero')).toHaveCSS('background-color', 'rgb(21, 62, 174)');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `Horizontal overflow at ${width}px: ${overflow}`);
      await page.screenshot({ path: `qa/screenshots/storefront/home-${width}.png`, fullPage: true });
      await page.close();
    }
    console.log('PASS: mobile and desktop storefront renders, blue hero, no horizontal overflow.');
  } finally { await browser.close(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
