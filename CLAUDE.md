# CLAUDE.md — bbtc-store

Project memory. Loaded every session. Detailed spec lives in
`BBTC-STORE-MASTER-BRIEF.md` — read it fully before writing code, then reference it.

## What this is

Ecommerce store + admin panel for Bright Blue Trading Corporation, an FMCG manufacturer
in Ernakulam, Kerala, founded 2019 by V.K. Faisal. **Eight brands, 100+ SKUs, spanning
cleaning, personal care, food and fragrance.** Replaces a broken WooCommerce site.
Single Next.js app, single Postgres database.

Brands: MX-3 (dish) · Rafasi (fabric) · Landfloro (floor) · Fairoze (personal care) ·
ANSAF (car) · Ilfa Valley (tea) · Kenzaniya (honey, spices, nuts, seeds, pickles, ghee) ·
MAKAFA (Premium Perfume & Fragrance).

MAKAFA is the eighth brand — confirmed real 22 August 2026 (found on bbtcglobal.com,
absent from the original brochure and master brief). It now has a `FRAGRANCE` segment,
a seed row and a **provisional** accent colour; its products and licences are still
unseeded. The other six brands have draft products with no prices, from the client's
brochure brief of 13 October 2026 (`prisma/seed-catalogue.ts`); only MX-3 has prices.
See `docs/bbtcglobal-catalogue.md` and
DECISIONS.md. **This is not a fragrance store**: the 24 fragrances are MX-3 *dishwash*
fragrances, and MAKAFA perfume is one brand of eight. Since 13 October 2026 each MX-3
fragrance is its own product ("Lemon Fragrant Dish Wash Liquid") with four sizes, at the
owner's request (`prisma/split-mx3.ts`); the old single product is an empty draft.

**Domains**: the store itself is hosted at brightbluefmcg.com. bbtcglobal.com is a
separate, currently-live static corporate site — not this app. brightblue.in is the old
WooCommerce site being replaced; do not treat it as a current property.

BBTC holds an International Book of Records for the most fragrance variants of a
dishwashing liquid — **24 for MX-3**. That is the headline asset; the design is built
around it.

## Non-negotiable rules

- **Money is `Int` in paise.** ₹149.00 = `14900`. Never a float. One `formatINR()`, in
  `src/lib/money.ts`.
- **GST rate is per product, never global.** This catalogue spans 18% detergents, 12%
  ghee, 5% spices, and nil-rated jaggery. Invoices need a per-HSN summary table.
- **Null price renders "Price on request", never ₹0.00.** Most SKUs have no published
  price yet. Do not seed placeholders — that is how the old site broke.
- **Food products require FSSAI fields** — licence, batch, best-before, veg mark,
  allergens — enforced at publish. Fairoze needs a cosmetics licence.
- **Every mutation checks the role server-side.** Hiding a button is not access control.
- **Every input is Zod-validated** at the server action or route handler boundary.
- **Order status changes only from a verified Razorpay webhook**, never the client.
- **`OrderItem` stores snapshots.** A product edit must never alter a past order.
- **One accent colour live at a time.** Brand accent on brand pages and image fields
  only. Never on body text, never on the CTA — the CTA is always `--bb-signal`.
- **No emoji, no lorem ipsum, no stock photography, no placeholder images.** The old
  site failed on all four.
- **Do not use Inter.** Clash Display for display, Satoshi for body.

## Commands

```
pnpm dev / build / test / lint
pnpm db:migrate | db:seed | db:studio
```

## Layout

```
src/app/(storefront)/   server components, ISR 60s
src/app/admin/          role-gated in layout + middleware
src/app/api/            webhooks, cart routes
src/lib/                money, gst, pricing, integrations
src/server/actions/     server actions, all Zod-validated
prisma/                 schema, migrations, seed
```

## Conventions

- Server components by default; `'use client'` only where interaction needs it
- Server actions for mutations; route handlers only for webhooks
- Prisma client is a singleton from `src/lib/db.ts`
- Percentages are basis points: 18% = `1800`
- Tailwind tokens only — no arbitrary hex in JSX

## Working agreement

- Build in the phase order in the master brief §12. Verify acceptance criteria before
  advancing.
- Log judgement calls in `DECISIONS.md`, one line each.
- When ambiguous, pick what keeps the admin simpler — the users are not technical.
- Ask before adding a dependency outside the locked stack.
- **Six open questions in §14 block Phase 1**, including a direct conflict on MX-3 sizes
  and a duplicate GSTIN across two entities. Ask before the first migration. Do not guess.

## Out of scope for v1

Subscriptions, Malayalam UI, mobile apps, marketplace sync, a page builder, loyalty,
referrals, gift cards, multi-currency, international shipping.
