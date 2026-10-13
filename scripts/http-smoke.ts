import assert from 'node:assert/strict';
async function main() {
const base = new URL(process.env.QA_BASE_URL ?? 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Smoke tests require a local isolated server.');
const request = (path: string, options?: RequestInit) => fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), ...options });
const home = await request('/');
assert.equal(home.status, 200);
assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
assert.equal(home.headers.get('x-frame-options'), 'DENY');
assert.equal(home.headers.get('referrer-policy'), 'same-origin');
assert.ok(home.headers.get('content-security-policy')?.includes("object-src 'none'"));
const html = await home.text();
assert.ok(html.includes('Find your kind of care.'));
assert.ok(html.includes('application/ld+json'));
assert.ok(html.includes('rel="canonical"'));
assert.ok(html.includes('Skip to content'));
for (const path of ['/shop', '/order', '/contact', '/terms', '/privacy-policy', '/refund-policy', '/shipping-policy', '/robots.txt', '/sitemap.xml', '/opengraph-image', '/api/health']) {
  assert.equal((await request(path)).status, 200, path);
}
const admin = await request('/admin', { redirect: 'manual' });
assert.ok([302, 303, 307, 308].includes(admin.status));
assert.ok(admin.headers.get('location')?.includes('/admin/login'));
assert.equal((await request('/api/cron/expire-stale-orders')).status, 401);
assert.equal((await request('/api/webhooks/razorpay', { method: 'POST', body: '{}' })).status, 400);
console.log('PASS: public routes, canonical/JSON-LD, security headers, admin redirect, cron authentication and forged webhook.');

}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Test failed'); process.exitCode = 1; });
