# Bright Blue store: hosting and launch runbook

Review date: 13 October 2026 (India). Source reviewed: `brightblue2026/store`, commit `4a3250f`. Destination: `brightblue2026/newstoreastra`.

## Recommendation

Use **Vercel Pro, Node.js 24, Mumbai (`bom1`)**, with managed PostgreSQL in the same or nearest available region, Supabase Storage for existing images, and Upstash Redis for shared rate limits. Keep payment secrets and other service credentials in the host's environment settings. `vercel.json` selects the native Next build and schedules unpaid-order cleanup every 15 minutes. Confirm the selected plan supports that schedule and the required execution limits before purchase.

This recommendation follows this application's workload, not a claim that one host is universally best. Prisma transactions, PostgreSQL advisory locks, scrypt and PDF rendering fit a Node runtime directly. The existing Cloudflare implementation needs an OpenNext adapter, Hyperdrive, KV/D1/DO cache bindings and patched WebAssembly loaders; it is viable but has more moving parts to operate.

| Option | Fit for this repository | Trade-off |
| --- | --- | --- |
| Vercel + nearby PostgreSQL | Recommended for simplest Next.js operation and previews | Monitor function, image and bandwidth spending; use a commercial plan and pooled DB connections |
| Cloudflare Workers + Hyperdrive | Existing supported architecture retained | 128 MB isolate memory and runtime adapter/WASM compatibility need deployment-specific verification |
| Managed Node container + PostgreSQL | Good if a team already operates containers | Own scaling, cache invalidation across instances, scheduling, backups and rollout operations |
| Ordinary static/shared hosting | Insufficient | This is a server application with transactions, authentication and webhooks |

Official references consulted:
- https://vercel.com/docs/functions/configuring-functions/region
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/cron-jobs
- https://developers.cloudflare.com/workers/platform/limits/

## Before deploying

1. Import **newstoreastra** as a new Vercel project. Do not attach the live domain yet. Node 24, repository root, frozen-lockfile install, `pnpm build:next` (declared in `vercel.json`). Do not use the default `pnpm build` for Vercel: it remains the legacy Cloudflare build.
2. Create a separate staging database. Use the pooled runtime connection as `DATABASE_URL` and the direct migration connection as `DIRECT_DATABASE_URL`. Do not run test scripts against production data.
3. Configure the final store origin, `AUTH_URL`, a random `AUTH_SECRET` of at least 32 characters, `CRON_SECRET` of at least 32 characters, Upstash credentials, Supabase Storage settings, and the required service credentials described in `.env.example`. Set `AUTH_TRUST_HOST` only behind the trusted hosting proxy. Override the repository's public production values in the preview environment; never use live payment keys for staging.
4. Online payments require **all three**: `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Start with test-mode keys. Keep webhook secrets separate from API secrets. Select automatic capture and subscribe to `payment.captured`, `order.paid`, and `payment.failed`.
5. Run `pnpm check:config` with the actual host environment available. This checks configuration presence, not network connectivity, provider permissions or settlement.
6. Back up the database, review migrations, then run `pnpm db:deploy` against staging. This change adds two indexes to Order, without rewriting commerce data. On a large production Order table, plan index creation during a maintenance window: ordinary CREATE INDEX can block writers.
7. Create real staff with `pnpm user:create`; do not seed development staff into production. Use least-privilege accounts and an access policy/MFA for administrative sign-in.
8. In the admin, publish complete products with real prices, HSN/GST values, images and required labels; record stock at active locations; configure exactly one confirmed seller of record. Configure shipping, COD eligibility, and approved customer policies. `/admin/readiness` reports configuration gaps without exposing secret values.

## Acceptance gates before domain cutover

- [ ] `pnpm check`, `pnpm build:next`, and production dependency audit pass on the exact release commit.
- [ ] Database migrations and the disposable PostgreSQL CI integration job pass. Verify restoration from backup separately.
- [ ] Customer mobile and desktop browsing, filtering, variant selection, out-of-stock behaviour, quantity edits, coupon errors, checkout, order lookup and invoice downloads work in a real browser.
- [ ] Staff, manager and admin permissions are exercised separately; disabled/demoted accounts lose access; direct actions reject insufficient roles.
- [ ] Product edits, image upload, combo choices, offers, inventory adjustments, policies and fulfilment transitions are exercised through the admin UI.
- [ ] Complete Razorpay **test-mode hosted Checkout** success, cancellation, failure and retry flows. Test signed duplicate and out-of-order webhooks; confirm only one stock decrement/invoice, and reconcile amount/currency/order identifiers in the dashboard.
- [ ] Verify a captured payment arriving after cancellation is flagged for refund, not fulfilled. Refunds are currently performed in Razorpay's dashboard and reconciled administratively; there is no automated refund API in this release.
- [ ] Confirm the webhook URL is reachable through deployment protection and the configured CSP permits hosted Checkout/UPI/netbanking. Watch webhook delivery failures and provider alerts.
- [ ] Courier, email and WhatsApp credentials and approved templates work; verify shipping slab fallback during courier outages. Never run courier purchase/AWB tests casually: they can create real shipments.
- [ ] The scheduled cleanup runs with Bearer authentication and releases unpaid reservations. It processes at most 100 candidates per invocation; monitor backlog and tune cadence/batch size for actual volume.
- [ ] Keyboard-only checkout, screen-reader field errors, reduced motion, mobile menus and contrast are reviewed. Run browser performance checks on representative data and images; target LCP <2.5s, INP <200ms and CLS <0.1.
- [ ] Run representative staged load: cached browsing plus dynamic search/cart/checkout/webhook traffic with realistic products, coupons and stock contention. Inspect p95/p99 latency, failures, DB pool waits, lock waits, CPU/memory and provider throttles. Keep real payment charges and courier dispatch disabled.
- [ ] Accountant approves an actual mixed-rate invoice, seller identity and applicable tax/licence data. Confirm published shipping/returns/privacy/terms content.

## Capacity and operational limits

`pnpm test:load` is a bounded, read-only **localhost** HTTP test. It deliberately cannot certify production checkout throughput. `scripts/e2e-stock-race.ts` exercises concurrent reservations against a disposable PostgreSQL fixture in CI. Both are needed: a fast cached homepage says nothing about a contended inventory row.

Node pools are capped at five connections per process with acquisition/idle/query deadlines. Use a managed pooler and budget total connections across all instances. The gapless financial-year order/invoice sequence uses advisory locks and remains a serialisation point. The existing five-digit series supports 99,999 orders/invoices per financial year; introduce a compatible wider series with accountant approval before approaching that limit. Large report ranges still load rows for aggregation: migrate them to database aggregate queries or materialised summaries before high-volume reporting.

Notifications and courier submission run after the transaction/response; this avoids rolling back paid orders due to provider failures, but **is not a durable outbox**. Add a persistent outbox/queue with retry and deduplication before requiring guaranteed delivery. Checkout has client submission protection, but does not yet have a durable client-request idempotency key; monitor ambiguous network retries and implement that before retry-heavy/high-volume operation.

Missing Redis intentionally blocks production login/checkout/cart operations; restore Redis to recover. Signed webhook routes stay available and still require signature verification. Put volume limits at the edge as an additional layer. The current CSP retains `unsafe-inline` for Next's inline bootstrap; a tested nonce-based policy is a future hardening step, not something certified here.

## Release and rollback

Deploy a preview first. Record the release commit and migration version, configure monitoring for `/api/health` (liveness only), 5xx rates, checkout failures and webhook failures. Inspect error logs for accidental PII. Set spending alerts. After the gates pass, map the production domain and verify HTTPS, canonicals, robots and sitemap; submit the sitemap in Search Console. Use real redirects for verified legacy URLs, not a guessed blanket redirect map.

Rollback application code to the previous known-good deployment if needed. These additive indexes can remain during code rollback. Do not restore an old database over newly paid orders; reconcile payments before any data recovery operation. Rotate credentials if exposed, including the GitHub token supplied in chat.
