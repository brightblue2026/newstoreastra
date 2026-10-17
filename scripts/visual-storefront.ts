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
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(base.href, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.colour-hero')).toHaveCSS('background-color', 'rgb(21, 62, 174)');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `Horizontal overflow at ${width}px: ${overflow}`);
      const heroImage = page.locator('.store-hero-stage img');
      await expect(heroImage).toBeVisible();
      assert.ok(await heroImage.evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0), 'Hero image must load');
      if (width < 768) {
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await expect(page.getByRole('navigation', { name: 'Mobile', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('navigation', { name: 'Mobile', exact: true })).not.toBeVisible();
      }
      const question = page.locator('.store-question').first();
      await question.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(question).toHaveAttribute('open', '');
      await expect(question.locator('p')).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(question).not.toHaveAttribute('open', '');
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.deepEqual(errors, [], 'No uncaught browser errors');
      await page.screenshot({ path: `qa/screenshots/storefront/home-${width}.png`, fullPage: true });
      await page.locator('.hero-shop-button').click();
      await expect(page).toHaveURL(/\/shop(?:\?|$)/);
      await expect(page.locator('main h1')).toBeVisible();
      assert.deepEqual(errors, [], 'No errors after shopping navigation');
      await page.close();
    }
    console.log('PASS: four responsive widths, hero image, menu, keyboard FAQ, shop navigation, no browser errors or horizontal overflow.');
  } finally { await browser.close(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
