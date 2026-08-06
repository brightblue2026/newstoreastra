# DECISIONS

Judgement calls not covered by `BBTC-STORE-MASTER-BRIEF.md`. One line each, newest
phase last. Where a call should be revisited once an open question is answered, the
question number is named.

## Phase 0 — Foundation

### Stack and tooling

- Pinned Next.js to **15.5.22**, the latest 15.x, rather than 16 — §5 locks the major version.
- Scaffolded into a temp subdirectory and moved the files up, because npm rejects a project directory whose name contains a space (`bright blue`).
- **Vitest** as the test runner. §5 names no test framework and Phase 0 requires passing unit tests; Vitest is the default for a Vite/TypeScript project and needs no Babel config.
- **pnpm 11** stores `onlyBuiltDependencies` in `pnpm-workspace.yaml`, not `package.json`; build scripts for Prisma, Sentry CLI, sharp and unrs-resolver are allowed there.
- Added `.gitattributes` normalising line endings to LF, so Windows development and Vercel's Linux builders agree.

### Money and GST

- `formatINR` renders **two decimals by default** (`₹149.00`), not `₹149`. Constant width keeps prices from jumping under `tabular-nums` when a variant with a different price is selected. `{ trimWholeRupees: true }` opts out.
- Rupee input is parsed **as a string**, never `Math.round(value * 100)` — `149.55 * 100` is `14954.999…` in IEEE 754 and would lose a paise.
- `MAX_PAISE` is ₹1 crore. Anything larger is rejected as a bug or a tampered input rather than accepted as a sale.
- `distributeProportionally` floors each share and hands the remainder to the **largest weights first**, then asserts the parts sum to the total exactly. §8 requires this for cart-level discounts.
- CGST/SGST is computed by **halving the tax, not the rate** — `cgst = floor(tax/2)`, `sgst = tax - cgst`. Halving the rate and calculating twice lets a rounded 9% + 9% drift a paise away from 18%. This is what makes "CGST + SGST always equals what IGST would have been" true by construction.
- An **unrecognised or missing delivery state is treated as inter-state** (IGST). Same total collected, so nobody is undercharged, and the figures still reconcile.
- `buildTaxByHsn` sums each HSN group **before** extracting tax, so printed row totals reconcile to the amount charged for that group. Lines sharing an HSN *and* rate merge into one invoice row; the same HSN at two different rates stays two rows (turmeric powder vs fresh).
- State resolution accepts full names, two-letter abbreviations, GST state codes and the common misspelling "Kerela".
- `PLACE_OF_SUPPLY_STATE` is a single constant so there is exactly one line to change once **open question 6** (seller of record and the duplicate GSTIN) is settled.

### Database

- Prisma installed at **7.9.1**. Prisma 7 no longer accepts `url` in `datasource` and no longer reads `.env` itself: the connection string moved to `prisma.config.ts`, loaded with Node's built-in `process.loadEnvFile` rather than a `dotenv` dependency.
- Driver adapter is **`@prisma/adapter-pg`** over Neon's pooled endpoint, not `@prisma/adapter-neon`. One less dependency, works unchanged in any Node runtime, and Neon speaks standard Postgres. Revisit if edge-runtime database access is ever needed.
- The client generates to `src/generated/prisma` and is **gitignored**; `postinstall` regenerates it.
- `db` is a **lazy `Proxy`** rather than an eagerly constructed client. `next build` evaluates route modules without a database, and a missing `DATABASE_URL` should fail the request that needs it, not the build.
- **No migration has been run.** Six open questions in §14 block it — see below.
- Added a missing back-relation `ProductVariant.comboItems` for `ComboItem.variant`; Prisma requires both sides. Everything else is §7 verbatim.

### Auth and roles

- **JWT sessions, no Prisma adapter.** The §7 schema has no `Account` or `Session` model, and both staff credentials and customer phone OTP require the JWT strategy. `@auth/prisma-adapter` was installed and then removed as dead weight.
- Password hashing uses **`node:crypto` scrypt**, not bcrypt or argon2 — a memory-hard KDF on OWASP's recommended list, with no native dependency to build on Vercel. Parameters (N=2^17, r=8, p=1) travel inside the hash string so they can be raised later without invalidating existing passwords.
- A failed lookup verifies against a **dummy hash** so a request for an unknown address takes the same time as a wrong password; staff accounts cannot be enumerated.
- Sign-in returns **one message for every failure** — wrong address, wrong password, deactivated account.
- `/admin/login` sits **outside** the gated layout, in `src/app/admin/(panel)/`, otherwise the layout's own guard would redirect the login page to itself.
- Enabled `experimental.authInterrupts` so `forbidden()` returns a **403 to a signed-in but insufficient role**, rather than redirecting them to a login page they are already past.
- `@auth/core` added as an explicit dependency: `next-auth/jwt` only re-exports it, declaration merging does not follow a re-export, and pnpm does not hoist it — so the `JWT` augmentation was silently a no-op without it.
- `GUEST` is not a stored role. It is the absence of a session.

### Design system

- Tailwind's spacing base is set to `4px`, making the §9 scale reachable as steps 1, 2, 3, 4, 6, 8, 12, 16, 24. **Do not write `p-5`, `gap-7` or `mt-9`** — values between the scale are a design error, not a convenience.
- The typographic scale ships as `@utility` classes (`type-display-lg`, `type-body`, `type-caption`…) rather than loose Tailwind combinations, so the scale cannot drift.
- Two radius tokens only: `rounded-control` (4px) and `rounded-card` (16px), plus `rounded-full` on swatches. There is no fourth radius.
- The live brand accent is a CSS variable `--bb-accent`, set per page from `Brand.accentHex` or `ProductVariant.variantHex`. One accent live at a time; never on body text, never on a CTA.
- **JetBrains Mono comes from `next/font/google`**, which self-hosts at build time. Only Clash Display and Satoshi needed manual Fontshare downloads. Only the weights §9 names are shipped.
- Sentry's `beforeSend` strips cookies, auth headers and the user object — §13 forbids PII in logs.

## Phase 1 — Catalogue and admin CRUD

### Database

- **The first migration has been applied** (`20260802101811_phase1_init`), against a fresh
  Neon project dedicated to this app rather than reusing an ambient `POSTGRES_URL` found in
  the shell environment, which turned out to belong to an unrelated project — worth
  double-checking any pre-set `DATABASE_URL`-shaped variable before trusting it. The six
  §14 questions below are still open; the migration only applies the *schema*, and the seed
  deliberately stops short of any data they'd determine. See the seed note under Phase 1 in
  `PROGRESS.md`.
- Seed's `tsx` swap: `prisma.config.ts` originally named `node --experimental-strip-types`
  as the seed runner. That flag only strips types, it does not resolve path aliases or
  bundler-style imports — it failed inside Prisma's own generated client on first run, not
  just in `seed.ts`. `tsx` replaces it; `esbuild`'s postinstall script needed an explicit
  `allowBuilds: true` in `pnpm-workspace.yaml` for pnpm's supply-chain gate to let it run.

### Admin CRUD

- **Product and Combo are created as drafts** (`isActive: false`), not §7's schema default
  of `true`. Neither can mean anything without a variant/component yet, and the real
  publish guard (variant + image + HSN + food-label, or ≥1 component for a combo) only runs
  when the admin explicitly flips the toggle — so the moment of publishing is always a
  deliberate, guarded action rather than a side effect of hitting "save" on the first draft.
- **The "no price" publish guard is not implemented.** §12 Phase 1 lists it as blocking, but
  §7 makes a null `pricePaise` an intentional "Price on request" state. Implementing the
  guard as literally written would break that feature. Left unenforced pending a decision
  on which one is actually meant.
- **`ComboItem.choiceOf` is validated server-side to be variants of the same product** as
  the slot's own `variantId` — §7 says "restrict options; empty = any in product," which
  only means something if the restriction can't point outside the product.
- Discount `code` is normalised to uppercase and restricted to `[A-Z0-9-]` — it is
  customer-facing and will end up in URLs and support conversations; keeping the charset
  boring avoids encoding surprises later.
- Every admin list/edit screen for Brand, Category, Product, Combo reuses the same
  create/update/toggle-active/audit-log shape. `src/lib/category-tree.ts` and
  `src/app/admin/(panel)/products/format.ts` hold the one-off pure helpers (tree flattening,
  claims/steps/food-label JSON ↔ form-field conversion) that a `'use server'` actions file
  cannot itself export, since every export from such a file must be an async function.

### Pricing engine

- `src/lib/pricing.ts` interprets a few things §8 leaves implicit, each covered by a test in
  `pricing.test.ts`:
  - Non-stackable conflicts are resolved **before** any discount is applied: partition
    candidates into stackable and non-stackable, keep all of the former, keep only the
    single best of the latter (by priority, then by the larger of the two hypothetical
    discount amounts).
  - `minOrderPaise` is checked once, against the subtotal of the lines the discount's scope
    actually matches — not re-evaluated as other discounts change the remaining amount.
  - `BUY_X_GET_Y` flattens matching lines into one price per unit, sorts ascending, and
    frees the cheapest `getQty` units in every full `buyQty + getQty` group.
  - `TIERED_QUANTITY` picks the tier with the largest `minQty` at or below the matching
    quantity — the best tier the cart qualifies for, not the first one that matches.
  - Cart line `quantity` is bounded at 999 as a defensive upper limit — nothing currently
    feeds it untrusted input, but a checkout route eventually will.
- Wired to the cart via `src/lib/cart-pricing.ts` — still nothing downstream (checkout,
  orders) calls it yet. The function stays deliberately pure (no DB access) so it can be
  tested in isolation; `cart-pricing.ts` is the layer that does the re-fetching, which is
  what makes "a client-tampered price cannot change a total" actually true rather than just
  a property of a function nothing calls.

### Cart, order numbers, COD

- **A `Combo` cart line is exploded into one pricing line per component**, the package
  price apportioned across them by each component's own price weight
  (`distributeProportionally`). `Combo` has no HSN or GST rate of its own — nothing in §7 or
  §10 says how a bundle should be taxed — so this is a judgement call, not a spec: it is the
  standard real-world treatment for a mixed bundle (apportion by value), and it means
  `calculateCart`'s per-line HSN requirement doesn't need a schema change to accommodate
  combos. Revisit if BBTC's accountant wants something else.
- **Order number generation stops at formatting, not sequencing.** `formatOrderNumber` is
  pure and tested; assigning the next number for real needs a gapless, race-safe counter
  per financial year (a Postgres advisory lock or a counter row) inside the same
  transaction as the `Order` insert — and no `Order` can be inserted yet regardless, since
  `sellerEntityId` is required and open question 6 is still open.
- **`CodSettings` (pincode allowlist, fee, min/max, toggle) has no home yet** — no
  `Settings` model, no admin screen. `checkCodEligibility` takes it as a parameter so
  whichever of those arrives first is a small wiring change, not a rewrite. Allowlist
  entries are matched as pincode *prefixes* (`"67"` matches every 67xxxx pincode), matching
  §10's "Kerala-and-adjacent allowlist" phrasing better than requiring every exact pincode
  to be listed.

## Open questions blocking real catalogue data

Per §14. The schema is migrated and the admin CRUD works against it, but these still block
entering the actual brand/product catalogue and building invoicing.

1. **MX-3 sizes** — brochure says 900/450/225 ml, brightblue.in sells 250/500 ml/1 L with real prices. Determines the entire variant matrix.
2. **MX-3 fragrance list** — the two sources name different sets. The record claim makes the canonical 24 legally significant.
3. **Is MX-3 Liquid vs Semi-Gel a format axis or a separate line?**
4. **FSSAI licence number and scope** — does it cover online sale of Kenzaniya and Ilfa Valley?
5. **Cosmetics licence for Fairoze.**
6. **Seller of record and the GSTIN** — brightblue.in publishes the same GSTIN for two entities.
