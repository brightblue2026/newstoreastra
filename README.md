# Bright Blue store

A strict TypeScript / Next.js storefront and role-protected admin for Bright Blue Trading Corporation. PostgreSQL/Prisma, Razorpay, Supabase Storage, Shiprocket, and configurable communications.

## Current review

- [Detailed review: all 11 requested points](docs/REVIEW-2026-10.md)
- [Hosting, staging acceptance and rollback runbook](docs/HOSTING-READINESS.md)
- [Photography sources](docs/ASSET-SOURCES.md)

The code has local build, type, lint, unit/regression and HTTP smoke coverage. This is **not a certification of live payment settlement, browser accessibility or production capacity**; the runbook identifies the remaining launch gates.

## Local setup

Node.js 24 and pnpm 11 are required.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# Fill in a local DATABASE_URL and a unique AUTH_SECRET.
pnpm db:deploy
pnpm dev
```

Never run integration fixtures, development staff seeds or destructive tests against a real customer database. Use test-mode gateway keys in staging. Environment credentials belong in the hosting secret manager, never Git.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm check` | Lint, strict typecheck, unit and isolated regression tests |
| `pnpm audit:production` | Production dependency vulnerability gate |
| `pnpm build:next` | Native Next.js production build; Vercel uses this |
| `pnpm start` | Serve the native production build |
| `pnpm build` / `pnpm cf:build` | Existing Cloudflare/OpenNext build |
| `pnpm check:config` | Configuration-presence check; requires actual deployment environment |
| `pnpm test:http` | HTTP smoke tests against localhost |
| `pnpm test:load` | Bounded read-only localhost load; not a checkout capacity certification |
| `pnpm db:deploy` | Apply reviewed migrations using direct DB connection |
| `pnpm user:create` | Create a real staff account |

`QA_BASE_URL` and `LOAD_BASE_URL` can select a local test server. Default is `http://localhost:3000`. `LOAD_REQUESTS` and `LOAD_CONCURRENCY` set bounded test volume. Keep the test server and runner in the same network namespace.

## Deploy

Recommended: Vercel with Node in Mumbai and nearby managed PostgreSQL. `vercel.json` supplies the native build, region and 15-minute cron. See the runbook before domain cutover. The Cloudflare configuration remains available and requires its own cache/Hyperdrive bindings; use `CLOUDFLARE_DEV=1` only when local development needs those bindings.

`/api/health` is liveness only. `/admin/readiness` is administrator-only configuration guidance, not a live-service test.

## Commerce invariants

- Money is integer paise; GST and HSN are product-specific.
- Prices and totals are derived server-side. A missing price is “Price on request.”
- Inventory must be tracked and available before an order can reserve it.
- Paid state follows a verified captured-payment webhook, never a client success callback.
- Transactions hold order/inventory changes together; historical order lines are snapshots.
- Every protected mutation checks the current role server-side.
- Food/cosmetic publishing requires the corresponding catalogue and licence fields.

The original master brief, `CLAUDE.md`, `DECISIONS.md` and `PROGRESS.md` retain historical context; their old phase-status statements should not be confused with the current review.
