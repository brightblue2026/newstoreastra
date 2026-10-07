# bbtc-store

Storefront and admin panel for **Bright Blue Trading Corporation** — an FMCG manufacturer
in Ernakulam, Kerala. Seven brands, 100+ SKUs, spanning cleaning, personal care and food.

One Next.js application, one Postgres database, one Cloudflare Workers deployment.

- `BBTC-STORE-MASTER-BRIEF.md` — the single source of truth: requirements, schema, design
  system, compliance, build phases. Read it before writing code.
- `PROGRESS.md` — **what has been built so far, and what blocks the next phase.** Start here.
- `CLAUDE.md` — project memory, loaded every session.
- `DECISIONS.md` — judgement calls not covered by the brief, one line each.
- `catalogue.json` — scraped product data from brightblue.in and the brand site.
- `docs/` — the company brochure and the earlier PRD corrections.
- `assets/source-photos/` — unprocessed product photography.

## Getting started

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
cp .env.example .env        # then fill in DATABASE_URL and AUTH_SECRET
pnpm dev
```

Generate an auth secret with `npx auth secret`. Phase 0 needs only `DATABASE_URL` and
`AUTH_SECRET`; every other variable is documented in `.env.example` ahead of the phase
that needs it.

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build (regenerates the Prisma client first) |
| `pnpm test` | Unit tests |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Create and apply a migration |
| `pnpm db:seed` | Seed the database |
| `pnpm db:studio` | Prisma Studio |

## Layout

```
src/app/(storefront)/   server components, ISR 60s
src/app/admin/          role-gated in middleware, layout and every server action
src/app/api/            webhooks, cart routes
src/lib/                money, gst, roles, session, db, integrations
src/server/actions/     server actions, all Zod-validated
prisma/                 schema, migrations, seed
```

## Non-negotiables

These come from the brief and are not up for rediscovery:

- **Money is `Int` in paise.** ₹149.00 is `14900`. Never a float. One `formatINR()`, in
  `src/lib/money.ts`.
- **GST is per product, never global.** 18% detergents, 12% ghee, 5% spices, nil-rated
  jaggery. Invoices need a per-HSN summary table.
- **A null price renders "Price on request", never ₹0.00.** Do not seed placeholders.
- **Food products require FSSAI fields at publish.** Fairoze needs a cosmetics licence.
- **Every mutation checks the role server-side.** Hiding a button is not access control.
- **Order status changes only from a verified Razorpay webhook**, never the client.
- **`OrderItem` stores snapshots.** A product edit must never alter a past order.
- **One accent colour live at a time**, never on body text, never on the CTA.
- No emoji, no lorem ipsum, no stock photography, no placeholder images. Not Inter.

## Status

**Phase 0 — Foundation: complete.** Scaffold, design tokens, self-hosted fonts, Prisma
schema, Auth.js with five roles, `/admin` gated in three layers, Cloudinary and Sentry
config, `money.ts` and `gst.ts` with 95 passing tests.

**No migration has been run.** Six open questions in brief §14 block the first one — see
the end of `DECISIONS.md`.

Phases 1 to 8 are listed in brief §12. Verify a phase's acceptance criteria before
starting the next.
