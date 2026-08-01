# bbtc-store — final documentation

**`BBTC-STORE-MASTER-BRIEF.md` is the single source of truth.** It supersedes every
earlier PRD and revision document.

## Setup

1. Create the repo, copy these files to the root.
2. `CLAUDE.md` at root — Claude Code loads it every session.
3. Open Claude Code from the repo root and paste:

> Read `BBTC-STORE-MASTER-BRIEF.md` in full before writing any code. Then begin Phase 0
> only — scaffold, Prisma, Auth.js with five roles, and `lib/money.ts` + `lib/gst.ts`
> with passing tests. Stop and show me before continuing. Six questions in §14 block
> Phase 1 — ask me those before the first migration.

## What changed from earlier drafts

| Was | Now |
| --- | --- |
| 1 brand, 6 fragrances | **7 brands, 24 fragrances, 100+ SKUs** |
| Detergents at a flat 18% GST | **Three regimes** — detergent, cosmetics, and a dozen food rates |
| FSSAI not mentioned | **Blocking** — food is most of the catalogue |
| Fairoze unknown | **New brand** — personal care, cosmetics regulation |
| 3 legal entities | **11 locations, including London** |
| No headline asset | **World record: 24 fragrances** — anchors the homepage |

## Files

- `BBTC-STORE-MASTER-BRIEF.md` — requirements, schema, design system, compliance, phases
- `CLAUDE.md` — project memory, loaded every session
- `catalogue.json` — scraped product data from brightblue.in and the brand site
