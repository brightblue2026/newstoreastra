/** Bounded read-only HTTP load test. Never targets the live store by default. */
import { performance } from 'node:perf_hooks';
async function main() {
const base = new URL(process.env.LOAD_BASE_URL ?? 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('Use a local isolated server. For staging load testing use the documented runbook.');
}
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);
const total = Number(process.env.LOAD_REQUESTS ?? 100);
if (![concurrency, total].every(Number.isSafeInteger) || concurrency < 1 || concurrency > 100 || total < 1 || total > 10000) throw new Error('Invalid load budget.');
const routes = ['/', '/shop', '/robots.txt', '/api/health'];
let cursor = 0;
let failed = 0;
const latencies: number[] = [];
const start = performance.now();
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < total) {
    const index = cursor++;
    const now = performance.now();
    try {
      const response = await fetch(new URL(routes[index % routes.length], base), { signal: AbortSignal.timeout(15000) });
      const body = await response.text();
      const expected = process.env.LOAD_EXPECT_PRODUCT;
      const listingMissing = routes[index % routes.length] === '/shop' && expected && !body.includes(`/products/${expected}`);
      if (!response.ok || listingMissing) failed++;
    } catch { failed++; }
    latencies.push(performance.now() - now);
  }
}));
latencies.sort((a, b) => a - b);
const percentile = (p: number) => Math.round(latencies[Math.min(latencies.length - 1, Math.ceil(p * latencies.length) - 1)]);
const result = { requests: total, concurrency, failed, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), requestsPerSecond: +(total * 1000 / (performance.now() - start)).toFixed(2) };
console.log(JSON.stringify(result, null, 2));
console.log('This measures local HTTP serving only; database contention, payment settlement and production capacity require staging tests.');
if (failed > 0 || result.p95Ms > 3000) process.exitCode = 1;

}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Test failed'); process.exitCode = 1; });
