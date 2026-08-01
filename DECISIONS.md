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

## Open questions blocking the first migration

Per §14, these must be answered before `prisma migrate` is run. The schema is written and
validates, but nothing has been applied to a database.

1. **MX-3 sizes** — brochure says 900/450/225 ml, brightblue.in sells 250/500 ml/1 L with real prices. Determines the entire variant matrix.
2. **MX-3 fragrance list** — the two sources name different sets. The record claim makes the canonical 24 legally significant.
3. **Is MX-3 Liquid vs Semi-Gel a format axis or a separate line?**
4. **FSSAI licence number and scope** — does it cover online sale of Kenzaniya and Ilfa Valley?
5. **Cosmetics licence for Fairoze.**
6. **Seller of record and the GSTIN** — brightblue.in publishes the same GSTIN for two entities.
