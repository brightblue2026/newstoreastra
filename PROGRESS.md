# Progress

Where the build has got to, and what the next person needs to know. Updated at the end of
each phase. Phase definitions and acceptance criteria live in
`BBTC-STORE-MASTER-BRIEF.md` §12; judgement calls live in `DECISIONS.md`.

---

## Phase 0 — Foundation · **complete** · 1 August 2026

All four gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test` (95 tests), `pnpm build`.

### Acceptance criteria

The brief's Phase 0 bar is: *"ADMIN can log in, CUSTOMER is rejected from `/admin`
server-side, ₹149.00 round-trips as `14900`, and the GST split is correct for Kerala and
non-Kerala."* Each is covered by a test rather than an assurance.

| Criterion | Proven by |
| --- | --- |
| ₹149.00 round-trips as `14900` | `src/lib/money.test.ts` |
| CUSTOMER rejected from `/admin` server-side | `src/auth.config.test.ts`, `src/lib/roles.test.ts` |
| GST split correct for Kerala vs non-Kerala | `src/lib/gst.test.ts` |
| ADMIN can sign in | `src/lib/password.test.ts` + the sign-in route; end-to-end needs a database |

Verified running against `pnpm dev`:

```
/             200
/admin        307 → /admin/login?callbackUrl=…     (anonymous turned away)
/admin/login  200
```

Served CSS confirms the §9 tokens (`--color-ink`, `--color-paper`, `--color-signal`,
`--color-line`) and the three faces — Clash Display, Satoshi, JetBrains Mono. No Inter.

### What was built

**Scaffold** — Next.js 15.5.22, App Router, TypeScript strict, Tailwind v4, pnpm.
Route groups `(storefront)` and `admin/(panel)` in one codebase.

**Design system** (`src/app/globals.css`) — the §9 tokens as Tailwind v4 `@theme`
entries. The typographic scale ships as `@utility` classes (`type-display-lg`,
`type-body`, `type-caption`…) so it cannot drift. Two radii only, one shadow, three motion
durations, `prefers-reduced-motion` honoured. `--bb-accent` carries the one live brand
accent.

**Fonts** — Clash Display (500, 600) and Satoshi (400, 500, 700) downloaded from Fontshare
and self-hosted via `next/font/local`; only the weights §9 names are shipped. JetBrains
Mono via `next/font/google`, which also self-hosts at build time.

**Money** (`src/lib/money.ts`) — integer paise throughout. `formatINR` with Indian digit
grouping, string-based rupee parsing that cannot drift on floating point,
`formatPrice(null)` → "Price on request", and `distributeProportionally` which splits a
cart-level discount across lines without losing or inventing a paise.

**GST** (`src/lib/gst.ts`) — per-product rates in basis points, tax back-calculated out of
GST-inclusive prices, CGST/SGST vs IGST by place of supply, and `buildTaxByHsn` producing
the per-HSN breakdown a mixed-rate invoice needs. Full Indian state table with code and
abbreviation resolution.

**Database** (`prisma/schema.prisma`, `src/lib/db.ts`) — the complete §7 schema, validating
and generating. Prisma 7 with the `@prisma/adapter-pg` driver adapter; the client is a
lazy singleton so `next build` does not need a database.

**Auth** (`src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/lib/session.ts`,
`src/lib/roles.ts`, `src/lib/password.ts`) — Auth.js v5, JWT sessions, staff email/password
over `node:crypto` scrypt. `/admin` is gated in **three layers**: middleware, the
`(panel)` layout, and `requireRole`-family guards that every server action will call.
STAFF is explicitly denied pricing and catalogue access per §6.

**Integrations** — Cloudinary helper with the §9 photography checklist and a 2000px
minimum; Sentry for client, server and edge with a `beforeSend` that strips cookies, auth
headers and the user object, because §13 forbids PII in logs. `.env.example` documents
every variable across all eight phases.

### Not done, deliberately

- **No migration has been run.** The schema validates but nothing has been applied to a
  database. Six §14 questions block it — listed below.
- **No seed data.** §7 is explicit: do not seed placeholder prices. That is how the
  WooCommerce site being replaced ended up showing ₹0.00 on everything.
- The storefront home page and `/admin` are honest placeholders. Real screens are Phase 2
  and Phase 1 respectively.

### Dependencies added outside the §5 stack

The brief asks that these be flagged. Three, each forced rather than chosen:

- **Vitest** — §5 names no test runner, and Phase 0 requires passing unit tests.
- **`@prisma/adapter-pg` + `pg`** — Prisma 7 requires a driver adapter; there is no
  engine-based connection any more.
- **`@auth/core`** — `next-auth/jwt` only re-exports it, declaration merging does not
  follow a re-export, and pnpm does not hoist it, so the JWT type augmentation was
  silently a no-op without it.

`@auth/prisma-adapter` was installed and then removed: JWT sessions need no adapter, and
the §7 schema has no `Account` or `Session` model.

---

## Phase 1 — Catalogue and admin CRUD · **in progress** · 2 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (112 tests), `pnpm build` all pass. First
migration applied against a dedicated Neon project (`bbtc-store`, Singapore region) and
seeded with unblocked data only — see below.

### What was built

**Database** — first migration (`prisma/migrations/20260802101811_phase1_init`) applied.
`prisma/seed.ts` seeds only what §14's open questions don't block: 11 locations, 3 legal
entities (`gstin`/`isSeller` left unset — open question 6), 7 top-level categories (one per
`Segment`, no brands or fragrances under them), and 3 dev-only staff accounts
(`{role}@dev.bbtc.local`, password in `SEED_STAFF_PASSWORD` or a printed default — **rotate
before any handover, never reuse in production**). Seed command switched from
`node --experimental-strip-types` to `tsx`: the former can't resolve this project's
bundler-style path aliases or Prisma's own generated-client imports, and failed inside
Prisma's own output on first run.

**Admin CRUD** — Brand, Category (nested tree, cycle-guarded on re-parenting), Product
(claims, ingredients, usage steps, FSSAI food-label fields), ProductVariant (SKU, size,
MRP/price/wholesale via `lib/money.ts` — a blank price field is `null`, never `0`, so
"Price on request" keeps working), Discount (all five `DiscountType`s, form adapts per
type, coupon codes restricted to `[A-Z0-9-]`), Combo + ComboItem (component picker, choice
slots restricted to the same product's variants, live component-sum/package-price/saving
panel). Every mutation runs through `requireCatalogueAccess` (MANAGER+) and writes an
`AuditLog` row with the full before/after state.

**Publish guards** — Product cannot go live without ≥1 variant, ≥1 image, an HSN code, and
a complete food label if `isFoodProduct`. Combo cannot go live with zero components.
Products and combos are created as drafts (`isActive: false`) for this reason.

**Pricing engine** (`src/lib/pricing.ts`) — `calculateCart` per §8, pure and fully unit
tested against all 17 required cases: percentage/fixed/BOGO/tiered/free-shipping discounts,
non-stackable priority conflicts (tie-broken by larger customer saving), `maxDiscountPaise`
capping, zero-drift proportional line distribution, Kerala CGST+SGST vs. out-of-state IGST,
a three-HSN mixed-rate cart, expired/future/exhausted discounts ignored. Not yet wired to
any route — no cart or checkout exists yet to call it.

### Not done, deliberately

- **No Cloudinary upload.** Every image field is a plain URL text input. Blocks Product and
  Combo from ever legitimately publishing until real credentials are provided and the
  upload widget is built.
- **"No price" is not enforced by the publish guard.** §12 Phase 1 lists it as a blocker,
  but §7 makes `pricePaise: null` a deliberate feature ("Price on request"). Those two
  requirements conflict as written; resolving it needs a decision, not a guess, so the
  guard currently checks variant/image/HSN/food-label only.
- **Discount preview against a sample cart** (§12 Phase 4, marked mandatory) is not built.
  It needs the pricing engine, which now exists — this is the natural next step, not a
  fresh blocker.
- No storefront, cart UI, checkout, payments, orders, invoicing, or shipping. Nothing here
  is live on the internet — everything ran against a local dev server.

### Known gaps found during review

- **No rate limiting on staff login.** Auth.js's constant-time dummy-hash check already
  stops account enumeration, but brute-force throttling needs a shared store (Upstash
  Redis or similar) — an in-memory limiter would be fake protection once this deploys to
  Vercel's serverless model, where each request can land on a fresh, memory-isolated
  instance.
- **Two high-severity CVEs are pinned inside `next@15.5.22` itself** (`postcss@8.4.31`,
  `sharp<0.35.0` — `pnpm audit`), not in anything this project chose directly, and 15.5.22
  is already the newest patch on the locked major. Low practical exploitability today
  (postcss only ever processes our own developer-authored CSS; sharp only runs through
  `next/image`, which `next.config.ts` already restricts to `res.cloudinary.com`) but worth
  tracking for the next Next.js patch.
- **Neon connects as `neondb_owner`**, an owner-level role. Fine for development; needs a
  least-privilege application role (no DDL) before production traffic touches it.
- `AuditLog.action` is a free-form string in the schema but the app-level TypeScript type
  in `lib/audit.ts` only allows `create | update | deactivate | reactivate`. `ComboItem` has
  no soft-delete field, so removing one is logged as `deactivate` with `after: null` —
  workable, but a dedicated `delete` action would read more honestly.

---

## Blocking Phase 1

Per §14 and the working agreement, these are asked before the first migration, not
guessed at. The first three reshape the variant matrix; the last three decide whether
parts of the catalogue can be listed online at all.

1. **MX-3 sizes.** The brochure says 900 / 450 / 225 ml. brightblue.in sells 250 / 500 ml
   / 1 L with real prices (₹70 / ₹118–160 / ₹240–320). Different product lines, a repack,
   or one source is stale?
2. **The canonical 24 fragrances.** The two sources name different sets. The record claim
   makes the exact list of 24 legally and commercially significant — needed in writing.
3. **Liquid vs Semi-Gel.** A format axis across all fragrances, or a separate line? The
   site sells both at a consistent ~33% premium.
4. **FSSAI licence number and scope.** Does it cover online sale of the full Kenzaniya and
   Ilfa Valley ranges? If not, most of the catalogue cannot list.
5. **Cosmetics licence for Fairoze.** Manufacturing licence number and label declarations.
6. **Seller of record and the GSTIN.** brightblue.in publishes the same GSTIN,
   `32AAICB5392H1ZN`, for two different entities at different Palakkad addresses. Two
   entities cannot share a GSTIN. Invoicing cannot be built until this is settled.

Questions 7–16 are wanted before Phase 2 and are listed in the brief.

---

## Running it

```bash
pnpm install
cp .env.example .env     # AUTH_SECRET via `npx auth secret`; DATABASE_URL from Neon
pnpm prisma migrate deploy
pnpm prisma db seed
pnpm dev
```

`DATABASE_URL` is now required — the first migration exists and `/admin` screens beyond
the home page query Postgres directly. Sign in with any seeded `{role}@dev.bbtc.local`
account.
