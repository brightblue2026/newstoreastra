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
- No storefront, cart UI, checkout, payments, orders, invoicing, or shipping. Nothing here
  is live on the internet — everything ran against a local dev server.

### Discount preview against a sample cart · added 3 August 2026

§12 Phase 4 marks this mandatory. `previewDiscountAction` (`discounts/actions.ts`) runs the
*unsaved* form fields through the same `buildDiscountData` parsing `create`/`update` use,
builds cart lines from variants an admin picks on the form, and calls `calculateCart`
directly — so the preview reflects exactly what would be saved, including an honest "this
hasn't started yet" if the admin typed a future start date. Verified rendering against a
real seeded variant; the click-through (button → server action → result panel) itself
could not be exercised end-to-end — no browser automation tool was available this session,
only HTTP-level checks, and this feature calls the server action directly from client code
rather than through a plain form post, which curl cannot replicate.

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

### Cart, order numbers and COD rules · added 3 August 2026 · backend only

Client direction for this stretch: backend and business logic first, storefront/checkout UI
comes later as its own pass. `pnpm test` now at 130.

- **`src/lib/cart-store.ts`** — the client-side cart shape: `{ kind, id, quantity }` only,
  nothing priced. Zustand, persisted to `localStorage`. Safe to persist precisely because
  there is nothing here worth tampering with.
- **`src/lib/cart-pricing.ts`** — the actual security boundary §12 Phase 3 asks for: given
  cart line refs, it re-fetches every price, HSN and GST rate from Postgres and runs them
  through `calculateCart`. A client-tampered price cannot reach a total, because no price
  ever comes from the client. **Combo tax apportionment is a judgement call, not a spec**:
  `Combo` has no HSN/GST fields of its own, so a combo line is exploded into one pricing
  line per component, the package price split across them by each component's own price
  weight (`distributeProportionally`), each carrying its own component's HSN/GST. See
  DECISIONS.md.
- **`src/lib/order-number.ts`** — `Order.orderNumber` formatting (`"BB-2627-00001"`,
  financial-year-coded) and parsing, fully unit tested. Deliberately stops at formatting:
  the gapless, race-safe *sequence* needs a real transaction around an actual `Order`
  insert, and no order can be inserted yet — `sellerEntityId` is required and no `Entity`
  has `isSeller: true` (open question 6).
- **`src/lib/cod.ts`** — cash-on-delivery eligibility exactly per §10 (pincode allowlist,
  flat non-discountable fee, min/max order value, global toggle), unit tested. There is no
  `Settings` model or admin screen for these values yet, so a caller supplies them; the
  shape (`CodSettings`) is what that future screen would read and write.
- **A storefront UI pass exists locally but is held back, not pushed.** Before "backend
  only" was confirmed as this stretch's direction, a full pass was built — site header,
  cart drawer, home/brand/category/product/combo/search pages, JSON-LD, sitemap. It typechecks,
  lints, and builds, and was smoke-tested via curl against seeded data, but was never
  exercised in a real browser. Left on disk rather than deleted; picking it back up is the
  next UI pass whenever that starts, not a rebuild from zero.
- **The order-creation service itself is not built** — blocked on the same seller-entity
  question as order numbering above.

---

## Phase 2 — Storefront browse · **in progress** · 6 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (139 tests) and `pnpm build` all pass. Ten
storefront routes now build. Judgement calls are in `DECISIONS.md`.

### What was built

**Shell** — the announcement ticker, header + cart drawer and footer moved out of the
homepage into `src/app/(storefront)/layout.tsx`, so every browse page has them and every
page below stays a server component.

**Read models** (`src/lib/storefront.ts`) — one shared product-card projection used by
every listing surface, plus `listProducts` (brand / category-subtree / segment / search /
sort), `getBrandBySlug`, `getCategoryBySlug`, `getProductBySlug`, `getComboBySlug`,
`getTopCategories`, `getStockistsByDistrict` and `getSitemapData`. Every one degrades to
an empty result rather than throwing.

**Pages** — `/shop` (brand and category filters, five sorts), `/brands/[slug]`,
`/categories/[slug]` (lists the whole subtree, breadcrumbs, child chips),
`/products/[slug]`, `/combos/[slug]`, `/search`, `/story`, `/stockists`. All ISR 60s.
Filters and sort are links, not client state — `src/lib/query.ts`, unit tested.

**Product page** — gallery that follows the variant, the fragrance grid with
`variantHex` swatches, size and format axes, claims, no-JS `<details>` accordions for
description / usage / ingredients / FSSAI panel / cosmetics licence, related products, and
a sticky mobile add-to-cart. A null price renders "Price on request" with an enquiry link
carrying the product name and SKU, never ₹0.00.

**Cart drawer wired** — `src/server/actions/cart.ts` (`readCart`, Zod-validated) calls the
existing `priceCart`, so every price in the drawer is re-read from Postgres. Line
quantities, removal, named offers from `Discount.publicLabel`, free-shipping progress and
an unavailable-items notice. This is Phase 3's "server-side recomputation on every cart
read", brought forward because Phase 2's add-to-cart cannot be honest without it.

**SEO** — `Product` + `Offer` JSON-LD on products and combos, `sitemap.ts` built from live
rows, `robots.ts`, canonical URLs on every route via `metadataBase` + `alternates`.

### Verified

Against `pnpm dev` with **an empty `DATABASE_URL`**, which exercises every degrade path:

```
/ /shop /shop?sort=price-asc&brand=mx-3 /search /search?q=lemon
/story /stockists /sitemap.xml /robots.txt          200
/products|brands|categories|combos/does-not-exist   404
```

The only errors in the dev log were the 79 expected `DATABASE_URL is not set` throws, all
caught by the degrade handlers. `/shop` renders the header, footer and its empty-catalogue
sentence; `/stockists` falls back to the toll-free number; no `₹0.00` anywhere.

### Not done, deliberately

- **Nothing has been exercised against real catalogue data.** There is no local database
  in this environment — `DATABASE_URL` in `.env` is empty. So the fragrance grid, the
  variant picker, price sorting, the cart drawer's arithmetic and the JSON-LD `offers`
  array have been typechecked and rendered against *no* rows, never against a seeded
  catalogue or in a browser. That is the single biggest gap in this phase and the first
  thing to do next.
- **No Lighthouse run.** Phase 2's "done when" needs mobile ≥ 90; that needs a deployment
  with real images.
- **No reviews.** The `Review` model exists and is unread — Phase 7.
- **No checkout button in the drawer.** Phase 5.
- **Combo choice slots are shown but not selectable** — `CartLineRef` cannot hold a
  per-slot choice. Phase 4.
- **Still no Cloudinary upload,** so no product can legitimately publish yet. Every image
  field remains a URL text input.

---

## Phase 4 — Combos and discounts · **checklist complete, unverified against data** · 8 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (167 tests) and `pnpm build` all pass. This
closes the §12 Phase 4 list: the combo builder, the live saving panel, the discount admin
and the mandatory discount preview landed in Phase 1; the two customer-facing halves that
were deferred for needing a cart shape that can hold choices are now built.

### What was built

**Cart lines carry choices** (`src/lib/cart-line.ts`, new) — `CartLineRef` gains
`choices: { itemId, variantIds }[]`, and a line is now identified by `cartLineKey` rather
than `kind:id`, because two lines of the same combo with different fragrances are two
different things to buy. Choices are normalised (slots sorted, picks sorted within a slot)
so the same package keys the same however the customer clicked. A combo with no choice
slots still keys as plain `COMBO:<id>` — carts saved before this change keep working, and
the persisted store gained a v2 migration that sanitises anything malformed.

**Per-slot pickers** (`src/components/ComboChoices.tsx`, new) — one radio group per unit of
each choice slot, so a `quantity: 3` slot ("any 3 MX-3 fragrances") asks three times and
allows repeats. Every slot starts on its first option, so the package is always one that
exists and the button is never blocked on a decision nobody wants to make. A combo with no
choice slots keeps the plain `AddToCartButton`. A slot whose product has no active variants
left hides the button rather than offering an order the server would reject.

**Server-side choice validation** (`src/lib/combo-choice.ts`, new, pure) — every pick is
re-checked against the slot: active variant, active product, inside `choiceOf` when the
admin restricted the slot and otherwise a variant of the slot's own product, and exactly as
many picks as the slot has units. Unresolvable → the line is named as unavailable, never
silently swapped for the slot default. The chosen variant is what gets exploded into
pricing lines, so the combo's package price is apportioned across what actually ships and
each component still carries its own HSN and GST rate.

**Coupon entry** (`src/components/CartContents.tsx`) — code held in the cart store and
persisted with the lines, applied through the existing `readCart` → `calculateCart` path.
One message covers every way a code can fail, and it says the code is not valid *for this
cart* rather than claiming it does not exist, because "your cart is below the minimum" is a
fixable case that would otherwise read as a lie.

**`PriceResult.lines` ordering is now a contract** — always 1:1 with the input in order,
now documented and asserted in `pricing.test.ts`, because `priceCart` returns a `lineKeys`
array aligned to it. Grouping by combo id alone would merge two lines of the same combo
bought with different fragrances into one row with the wrong quantity.

### Verified

167 tests pass, up from 139. The 28 new ones cover the two things this phase can prove
without a database: `cartLineKey`/`normaliseChoices` (12), and choice resolution including
every rejection path — a pick outside `choiceOf`, a pick from another product when
`choiceOf` is empty, a nonexistent variant, a deactivated variant, a variant of an
unpublished product, too many picks, too few, a choice sent for a fixed slot, and a choice
naming a slot the combo does not have (15). Plus the line-ordering assertion (1).

Against `pnpm dev` with an empty `DATABASE_URL`, every route still degrades rather than
throwing: `/ /shop /search /story` 200, `/combos/…` and `/products/…` 404 for unknown
slugs, and the only errors in the log are the expected `DATABASE_URL is not set` throws.

### Not done, deliberately

- **Still nothing exercised against real catalogue data, and this phase needed it most.**
  There is no database in this environment — `DATABASE_URL` in `.env` is empty and Docker's
  daemon is not running. So the picker UI, the drawer's per-slot labels, the coupon round
  trip and the combo apportionment across *chosen* components have been typechecked, unit
  tested and built, but never rendered against a real combo or clicked in a browser. The
  validation logic is tested directly because it is the part that must not be taken on
  trust; the wiring around it is not. **Paste the Neon connection string into `.env` and
  this can be seeded with a real "any 3 MX-3 fragrances" combo and driven end to end** —
  that is the first thing to do next.
- **No per-slot choice reaches an order yet.** `OrderItem` has no field for it. Orders are
  Phase 5 and blocked on the seller-entity question regardless; when they are built, the
  chosen variants need to land on the order snapshot, not just the cart.
- Coupon usage counting is still not incremented anywhere — `Discount.usageCount` only
  moves when an order is placed, which cannot happen yet.

---

## Phase 5 — Checkout, payments, orders · **built, unexercised against a database** · 8 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (233 tests, up from 167) and `pnpm build` all
pass. Every §12 Phase 5 checkbox is addressed except phone OTP, which is deferred with a
reason below, and the MSG91 submission, which is BBTC's to make and is now written out
ready to paste. Judgement calls are in `DECISIONS.md`.

### What was built

**Settings** — a new `Setting` table (`prisma/migrations/20260808120000_phase5_settings`,
authored offline with `prisma migrate diff --from-schema`), read through
`src/lib/settings.ts` with one Zod schema per key and a safe default for each.
`/admin/settings` is ADMIN-only and holds three forms: **seller of record + GSTIN** (the
mechanism that lets BBTC answer §14 Q6 themselves), **cash on delivery** (toggle, fee,
min/max, pincode allowlist) and **delivery rates** (weight slabs, overflow charge, assumed
unit weight, serviceable pincodes). It opens with four plain statements about whether orders
can be taken at all — no seller of record, no Razorpay keys, no delivery rates, COD off —
because each of those is otherwise discovered by a customer at the end of checkout. Every
save is audited.

**Pincode and shipping** — `src/lib/pincode.ts` maps a pincode to a delivery state offline,
resolving only where a series unambiguously belongs to one state and reporting `ambiguous`
or `unknown` otherwise; a definite pincode overrules whatever state the customer selected,
because that is a tax decision. `src/lib/shipping.ts` rates the flat-rate slab table §10
asks for as a Shiprocket fallback — currently the only rate source, since Shiprocket is
Phase 6.

**Razorpay** (`src/lib/razorpay.ts`) — order creation over REST and HMAC-SHA256 signature
verification over `node:crypto`, no SDK added. `POST /api/webhooks/razorpay` verifies
against the raw body, fails closed, and is idempotent by `razorpayPaymentId` and again by
order state.

**The order transaction** (`src/lib/orders.ts`) — §4 in one interactive `$transaction`:
re-read prices through the transaction, re-run `calculateCart`, check inventory, increment
`reserved`, take a gapless order number under a per-financial-year advisory lock, insert the
`Order` and its `OrderItem` snapshots, increment discount usage. `src/lib/inventory.ts`
holds the allocation arithmetic as pure functions and `src/lib/order-status.ts` the state
machine, in which `PENDING_PAYMENT → CONFIRMED` is reachable by no actor but `'WEBHOOK'`.

**Checkout** — `/checkout`, one page and three sections (contact, delivery, payment) with a
live order summary. `src/server/actions/checkout.ts` exposes `quoteCheckout` (writes
nothing) and `submitOrder` (the only thing that creates an order), both Zod-validated
through `src/lib/cart-schema.ts`, which the cart action now shares rather than keeping a
second copy of the same shape. The cart drawer finally has a checkout button.

**Order pages** — `/order/[orderNumber]` confirmation and tracking, and `/order` for a
customer who lost the link. Access is by HMAC capability token or the full mobile number on
the order, never by order number alone, since numbers run in sequence. Both work with no
client JavaScript. For a prepaid order the page says the payment is being confirmed until
the webhook has actually landed.

**Admin orders** — `/admin/orders` list with status and order-number/phone filters, and
`/admin/orders/[orderId]` with items (HSN and rate per line), addresses, contact, the money,
the per-HSN GST table, and only the status transitions the state machine allows a member of
staff to make. There is deliberately no button that confirms a payment.

**MSG91** — `docs/msg91-templates.md`: the four WhatsApp templates written out verbatim with
every variable mapped to the field it comes from, the Utility-not-Marketing warning, the SMS
and DLT note, and what BBTC has to answer before template 4 can go in.

### Verified

233 tests pass. The 66 new ones cover what can be proven without a database: pincode
resolution including every ambiguous and unlisted series and a check that every state named
resolves through `gst.ts` (17), shipping slab rating and weight (11), Razorpay signature
verification including a key-reordered re-serialisation and an unconfigured secret (10),
inventory allocation including refusing to partially reserve and never driving `reserved`
negative (13), the order state machine and its stock effects (15).

Against `pnpm dev` with an **empty `DATABASE_URL`**, which exercises the degrade paths:

```
/checkout /order /order/BB-2627-00001                200
/admin/orders /admin/settings                        307 → /admin/login
POST /api/webhooks/razorpay, no signature            400
POST /api/webhooks/razorpay, forged signature        400
POST /api/webhooks/razorpay, valid signature         500  (verified, then no database)
/order/BB-2627-00001?t=<valid>    → past the gate, honest "cannot reach your order"
/order/BB-2627-00001?t=<wrong>    → the unlock form
```

The 400-versus-500 split is the point of that webhook check: 400 means the signature was
rejected, 500 means it was accepted and the database was not there. Every error in the dev
log traces to the single expected `DATABASE_URL is not set` throw.

### Not done, deliberately

- **Nothing has touched a database, and this phase needed it most.** `DATABASE_URL` is
  empty in this environment. So the order transaction, the advisory-lock order numbering,
  the inventory reservation, the discount usage increment, the webhook's idempotency against
  real rows and every admin order screen have been typechecked, unit tested where they are
  pure, and rendered — never run. **This is the first thing to do next:** paste the Neon
  string into `.env`, `pnpm prisma migrate deploy`, mark a seller entity in
  `/admin/settings`, and place a COD order end to end. That single path exercises the
  transaction, the numbering and the stock hold without needing Razorpay keys at all.
- **No ₹1 test transaction.** Phase 5's "done when" needs one, and it needs live test keys:
  `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are
  all unset. The webhook path was proven as far as signature verification with a locally
  supplied secret; the half that needs Razorpay to actually send something is untested.
- **Phone OTP for returning customers is not built.** It needs two things this deployment
  does not have: MSG91 credentials to send a code, and a shared store to hold the challenge
  and count attempts — the same gap that leaves staff login unthrottled. An OTP flow with
  in-memory attempt counting is fake protection on Vercel's serverless model, and one that
  cannot send a code is dead. Guest checkout is complete and is the whole customer-facing
  path; `submitOrder` already attaches an order to a signed-in user when there is one, so
  adding the provider later changes no order code.
- **No email or WhatsApp is sent on confirmation.** Phase 6, and the templates are the part
  that had to happen now.
- **Shiprocket is not called.** Serviceability comes from the admin's pincode prefix list
  and the rate from the slab table — which §10 wants as the fallback anyway, so Phase 6 adds
  a live rate in front of it rather than replacing it.
- **`perCustomerLimit` is only reachable for a signed-in user,** which today means staff.
  The query is written and correct; there are no customer accounts for it to apply to yet.
- **A cancelled unpaid order does not give back its discount usage.** §4 puts the increment
  in the creation transaction, so an order that is never paid has consumed a coupon use.
  Worth revisiting alongside a scheduled sweep of stale `PENDING_PAYMENT` orders, which also
  does not exist.
- **Still no Cloudinary upload,** so no product can legitimately publish, so nothing can
  actually be bought until that or a manual image URL lands.

---

## Phase 6 — Fulfilment, invoices, communications · **built, unexercised against a database** · 10 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (276 tests, up from 233) and `pnpm build` all
pass. Every §12 Phase 6 checkbox is addressed. The one thing the phase's "done when" asks
for — an accountant's approval of a generated mixed-rate invoice — now has an artefact to
review, which is the point of `pnpm invoice:sample`.

### Merge reconciliation, first

This session began three commits behind `origin/main`, which carried the resolved open
questions, the real MX-3 catalogue seed and a new CSP. Rebased Phase 5 on top. Two things
came out of it worth recording:

- **The CSP silently killed the entire payment flow.** `default-src 'self'` blocks
  `checkout.razorpay.com`, and the Razorpay modal is a cross-origin iframe no directive
  permitted. Nothing surfaces until a customer clicks Pay. Five directives widened, each
  documented in `next.config.ts` with the reason.
- **`razorpay-webhook.ts` was superseded.** Written as prep before Phase 5 existed; Phase 5
  built the real thing in `razorpay.ts`. Two exported `verifyWebhookSignature` functions
  with different signatures, only a test importing the dead one. Removed.

### What was built

**Invoice numbering** (`src/lib/invoice-number.ts`, `assignInvoiceNumber` in `invoice.ts`)
— `BBTC/2627/00001`, gapless per financial year under a per-FY advisory lock, derived from
the highest committed number rather than a counter. Fifteen characters: **CGST Rule 46(b)
caps an invoice number at sixteen**, and the obvious `BB/INV/2627/00001` is seventeen. A
test asserts the length at the maximum sequence, because otherwise an auditor finds it.

**When the number is taken is a judgement call** — §10 says "inside the order transaction",
§12 says "no gaps", and for a prepaid order those pull apart. Resolved by taking it in the
transaction that moves an order to CONFIRMED, which for COD *is* the creation transaction.
Both readings hold. In `DECISIONS.md`.

**The GST invoice PDF** (`invoice-pdf.tsx`, `@react-pdf/renderer` per §5) — per-HSN tax
summary table with intra-state and inter-state layouts that differ rather than zeroing
columns, per-line HSN and rate, amount in words in the Indian numbering system
(`amountInWords` in `money.ts` — lakh and crore, not thousands), FSSAI and cosmetics
licences on the orders that contain those goods. Nothing is recalculated: every figure
comes from the order's stored snapshot.

**`pnpm invoice:sample`** writes two real PDFs — one Kerala, one Tamil Nadu — from the same
fixture the tests assert against, so the reviewed document and the tested document cannot
drift. Verified by decompressing the content streams: four HSN rows, nil-rated jaggery
showing 0.00 tax against a real taxable value, ₹1,491.67 + ₹161.33 = ₹1,653.00.

**Shiprocket** (`shiprocket.ts` + pure `shiprocket-tracking.ts`) — token auth with a
nine-day cache, rate shopping, order push, AWB assignment, label URL, and a tracking
webhook at `POST /api/webhooks/shiprocket`. `delivery.ts` is the seam that decides between
a live rate and the slab table, and it distinguishes *"nobody delivers there"* from *"we
could not find out"* — conflating them would refuse orders BBTC can fulfil every time the
API blinks.

**Communications** — `email.ts` (Resend over REST, no SDK) sends the confirmation with the
invoice PDF attached and a shipped notice; `msg91.ts` sends the four WhatsApp templates
from `docs/msg91-templates.md` with an SMS fallback. `notifications.ts` is the single entry
point, always called *after* a transition commits and never inside it.

**Fulfilment actions** (`src/server/actions/fulfilment.ts`) — push to Shiprocket, assign an
AWB and ship, fetch a label, and **record an AWB by hand**. The manual path matters: BBTC
already ships DTDC directly, and §10's "never block an order because a third party is down"
applies to dispatch as much as to checkout.

**Invoice download** — `GET /api/invoice/[orderNumber]`, one route for both audiences:
a customer's capability token or a staff session. Rendered on demand, never stored — the
document is derived from immutable snapshots, so re-rendering is deterministic.

### Verified

276 tests pass, up from 233. The 43 new ones cover invoice numbering including the Rule
46(b) length limit and mutual rejection against order numbers (12), `amountInWords`
including the 2-2-3 lakh/crore grouping that is the whole reason it is hand-rolled (6),
mixed-rate invoice arithmetic and PDF rendering (8), Shiprocket tracking-webhook parsing
including **an assertion that no courier scan can ever map to CONFIRMED** (11), and phone
normalisation that refuses rather than truncates (6).

### Not done, deliberately

- **Still nothing has touched a database.** `DATABASE_URL` is empty in this environment. The
  invoice sequence's advisory lock, the order transaction that now raises an invoice, the
  Shiprocket push and every notification have been typechecked, unit tested where pure, and
  rendered — never run against Postgres. This remains the first thing to do next.
- **No admin UI for the fulfilment actions or the new shipping settings.** The server
  actions and the settings schema are built and guarded; the buttons and form fields on
  `/admin/orders/[orderId]` and `/admin/settings` are not wired to them yet. That is the
  next visible piece of work.
- **No third party has actually been called.** Shiprocket, Resend and MSG91 all have unset
  credentials, so every integration has been exercised only down its unconfigured path —
  which is the path that must degrade cleanly, and does.
- **MSG91 templates are still unapproved,** and `bbtc_order_delivered` remains blocked on
  §14 Q18 (the return policy, which differs for food). A template with no id configured is
  skipped with a log rather than faked.
- **No credit notes.** Once raised, an invoice number stays on the order even if it is later
  cancelled — which is correct under GST, where a raised invoice is reversed with a credit
  note, never deleted. Credit notes are not built, so a post-confirmation cancellation needs
  the accountant to raise one outside this system.
- **No retry queue for notifications.** A failed WhatsApp or email is logged, not retried.
  Doing it properly needs a durable job store this deployment does not have.

---

## Blocking Phase 1 · 4 of 6 resolved 9 August 2026

Per §14. Real source documents (trade licence, two FSSAI Basic Registrations, GST
registration, 28 product-label photographs) were supplied on 9 August 2026 and answer
four of these from primary evidence. Full detail and citations in `DECISIONS.md` under
"Open questions blocking real catalogue data" — summary here:

1. **MX-3 sizes — resolved.** 225 / 450 / 900 ml, ₹52 / ₹104 / ₹207. The brochure was
   right; brightblue.in's 250 ml/500 ml/1 L was stale.
2. **The canonical 24 fragrances — resolved.** Exact list of 24, off real label photos:
   Strawberry, Grapes, Green Apple, Orange, Green Lemon, Guava, Pineapple, Blue Berry,
   Litchi, Lemon, Green Mango, Pista, Green Papaya, Mango, Avocado, Mixed Fruits, Kiwi,
   Peach, Apple, Pomegranate, Cucumber, Butterfly Pea, Olive, Passion Fruit.
3. **Liquid vs Semi-Gel — still open.** Every photographed label says Liquid; no Semi-Gel
   label was among them. Not evidence it doesn't exist, just no evidence yet either way.
4. **FSSAI licence number and scope — partially resolved.** Two **Basic Registrations**
   exist (not a State/Central Licence): `21325201000650` (Biscuit, Tea only) and
   `21326201000001` (Ghee, pickles, rice, wheat, millets, flours, bread). Neither names
   Kenzaniya or Ilfa Valley — FSSAI doesn't register brand names. **New and important: a
   Basic Registration caps annual turnover at ₹12 lakh, per registration** — a real
   ceiling on how big the food side of this store can get before a Licence upgrade is
   required, not just a paperwork detail.
5. **Cosmetics licence for Fairoze — still open.** No document supplied.
6. **Seller of record and the GSTIN — resolved.** One GSTIN, `32DCVPK7871P1ZI`, one
   proprietorship ("Bright Blue Trading Corporation", proprietor Faisal Vathyedath
   Kunjimuhammed), five addresses (1 principal + 4 additional) under that single
   registration. There was never a duplicate-GSTIN conflict — the brochure data was
   simply wrong. `Bright Blue Manufacturing Pvt Ltd` is real too, but as the
   *manufacturer* named on product labels, not a second seller.

Questions 7–16 are wanted before Phase 2 and are listed in the brief; not addressed by
this document set.

---

## Admin: bulk variant entry on product creation · 21 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (191 tests) and `pnpm build` all pass.
`/admin/products/new` now has a repeatable "variant rows" section alongside the product
fields, so a product's whole initial size/format/fragrance lineup can be entered and saved
in one submit instead of one `/admin/products/[id]/variants/new` visit per row —
`createProductAction` creates the product and every row inside one transaction. Generic to
any brand or product, not MX-3-specific. Editing an existing product's variants still goes
through the original one-at-a-time pages, unchanged. See `DECISIONS.md` for why bulk
*image* rows were left out of this pass (`ProductImage.publicId` needs a real Cloudinary
asset id, and upload is still blocked on real credentials).

Not exercised against a real database in this environment (`DATABASE_URL` is empty here),
same caveat as the rest of the admin CRUD.

---

## Admin: Cloudinary signed upload, `ProductImage` CRUD · 22 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (191 tests) and `pnpm build` all pass. This is
the unblock the bulk-variant-rows pass above deliberately left out: `/admin/products/[id]/images`
now exists, and a product can get its first real `ProductImage` row without anyone
guessing a `publicId`.

**Split into a client-safe half and a server half.** `src/lib/cloudinary.ts` is
`server-only` (it configures the SDK with the API secret), so the plain constants a client
component also needs — the photography checklist, the allowed formats, the 2000px floor —
moved to a new `src/lib/cloudinary-shared.ts` with no SDK import and no secret, re-exported
from `cloudinary.ts` for existing server callers.

**The file itself never touches this app's server.** `signProductImageUploadAction`
(`products/[productId]/images/actions.ts`) signs only `{ timestamp, folder }` — Cloudinary
rejects the request if the client sends back a signed param that wasn't part of what got
signed — and the browser POSTs the file straight to `api.cloudinary.com`. Only the
resulting `public_id`/`secure_url`/`width`/`height` come back to
`saveProductImageAction`, which re-checks the long-edge and format rules server-side (the
client-side check in `image-uploader.tsx` is a courtesy, never the boundary) before writing
`ProductImage`. A file that fails either check server-side is deleted back off Cloudinary
rather than left as an asset no row ever points to.

Delete works the same way: remove the row, then best-effort `cloudinary.uploader.destroy`.
Logged with `action: 'deactivate'`, the same precedent `ComboItem` removal already set —
still no dedicated `delete` `AuditLog` action, a known gap from Phase 1.

Not exercised against a real Cloudinary account or database at the time this was written —
see "Real Cloudinary + database verification" below for what changed once real credentials
existed.

---

## Recheck: security + correctness review of the last two passes · 22 August 2026

Client asked for a full recheck ahead of the real launch domain being confirmed
(brightbluefmcg.com). Ran a security review and a high-effort code review against the
bulk-variant-rows and Cloudinary-upload diffs above. `pnpm lint`, `pnpm typecheck`,
`pnpm test` (191 tests) and `pnpm build` all pass after fixes.

**Security review: no HIGH/MEDIUM findings.** One borderline item — `saveProductImageAction`
validates `upload.url` as any URL, not specifically a `res.cloudinary.com` one — was
considered and not flagged: the caller is already gated to `MANAGER`+ via
`requireCatalogueAccess`, and `next.config.ts`'s `remotePatterns` independently blocks any
non-Cloudinary host at render time regardless. Worth tightening as defense-in-depth later,
not a vulnerability as shipped.

**Code review found one real breakage and three real reliability gaps, all fixed:**

- **The image uploader didn't actually work.** `next.config.ts`'s CSP shipped
  `connect-src 'self'` with no exception for `api.cloudinary.com`, so the browser blocked
  every upload attempt outright — the feature above had never been exercised end-to-end (no
  Cloudinary credentials in this environment), so this had never been caught. Fixed: added
  `https://api.cloudinary.com` to `connect-src`.
- **Bulk variant creation could time out or half-audit a batch.** The transaction awaited
  one `create` plus one `recordAudit` call per row, sequentially — up to 200 round trips
  against a serverless Postgres inside Prisma's default 5s interactive-transaction window,
  and a failure partway through could leave the AuditLog covering only some of a product's
  already-committed variants. Fixed: `createManyAndReturn` for the variant batch (one round
  trip), and every audit row now written inside the same `db.$transaction` as the product
  and variants, so the whole thing commits or rolls back together.
- **`.env.example` contradicted itself.** `RESEND_FROM_EMAIL` was set to
  `store-brightbluefmcg@gmail.com` right below a comment saying it must be a
  domain-verified sender — Resend cannot send as a gmail.com address at all. Fixed: the
  example now points at a domain mailbox (`orders@brightbluefmcg.com`) with a comment
  explaining why the store's real Gmail contact address can't go here.
- **Duplicated variant validation.** The single-variant form and the bulk-row parser had
  copy-pasted, byte-identical Zod schemas that could silently drift. Extracted to
  `products/variant-fields.ts`, imported by both.

**`ProductImage.sortOrder`'s race, fixed on request · 22 August 2026.** Originally left as
a known, accepted gap (see below) — `sortOrder` was computed via a non-atomic
read-then-write, so two near-simultaneous uploads for the same product could collide on
the same value. Postgres won't allow `SELECT MAX(...) FOR UPDATE` (FOR UPDATE rejects
aggregates), so the fix is a per-product transaction-scoped advisory lock
(`pg_advisory_xact_lock(hashtext(productId))`) around the read-then-write in
`saveProductImageAction` — two concurrent uploads for the same product now serialize
through the lock instead of both reading the same max. Released automatically on commit or
rollback, no manual unlock needed.

---

## Real Cloudinary + database verification · 23 August 2026

Client supplied real Cloudinary credentials (cloud name `em6hcfco`) and confirmed
`DATABASE_URL` in `.env` — already populated from Phase 1 — is a real, working Neon
connection. First time either has been exercised for real rather than typechecked against.

**Cloudinary — fully verified.** Signed a request with the exact algorithm
`signProductImageUploadAction` uses (sort params, sign with the secret, SHA1), uploaded a
real image to `bright-blue/products` through the real endpoint, got back a `public_id` in
the shape `saveProductImageAction` expects, deleted it the same way
`deleteProductImageAction` does. Full pipeline, proven outside the browser first.

**Database — fully reachable, contrary to this document's earlier assumption.** Every
"not exercised against real data" caveat elsewhere in this document assumed
`DATABASE_URL` was unreachable from a dev sandbox. It isn't — a direct query returned the
real seeded catalogue (7 brands, 1 product, 72 variants, 7 categories, 11 locations, 3 staff
accounts). The connection is real; it is just intermittently slow from this particular
sandbox's network path to Neon's Singapore region (queries ranging from instant to 30s+,
occasionally timing out) — a sandbox-environment characteristic, not a schema or code
problem, and not necessarily present in a real deployment.

**Found and fixed a real bug via actual browser testing**, the thing this whole document
has been flagging as never done: `image-uploader.tsx`'s client-side dimension check used
`URL.createObjectURL(file)` + `<img>` to read pixel dimensions before upload. The CSP's
`img-src` (`self`, `data:`, `res.cloudinary.com`) has no `blob:` exception, so the browser
silently blocked it — confirmed via the exact CSP violation message in the browser console,
not guessed at. Fixed by switching to `createImageBitmap(file)`, which decodes the file
in memory without going through the resource-fetch pipeline `img-src` governs at all — the
technically correct fix, not a CSP loosening.

**What's proven vs. not, honestly.** Login, real-data rendering on `/admin/products`
(showing the actual seeded "MX Three Dish Wash Liquid", 72 variants), and navigation to
the images tab were all confirmed working against real data in an actual browser
(Playwright + headless Chromium), with screenshots. The final step — clicking Upload and
confirming an image lands in the database — was **not** conclusively proven end-to-end in
the browser: Playwright's element-targeted `.click()` intermittently failed to deliver the
click to the button's React handler in this specific sandboxed headless-Chromium setup
(confirmed via a temporary debug log — the handler simply never ran on several attempts,
then did on others, with no code change in between). A raw coordinate `page.mouse.click()`
did reach the handler at least once and behaved correctly (correctly reported "Alt text is
required" when a Fast-Refresh-triggered remount had reset the field), which is evidence the
handler logic itself is sound, but the flakiness prevented a clean, repeatable, full
upload→row-created confirmation. This reads as a Playwright/headless-Chromium click-delivery
quirk in this sandbox rather than an application bug — the Cloudinary pipeline it depends on
was independently proven above — but it is not the same thing as having watched an image
actually appear on the page after a real click, and that gap shouldn't be glossed over.

---

## Fixed all 13 findings from the Phase 5/6 code review · 24 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (290 tests, up from 289) and `pnpm build` all
pass. Every finding from the multi-agent review of `adrifayin`'s merged Phase 5/6 work
(see the code-review report) fixed, not just logged:

- **`transitionOrder` now takes a row lock** (`SELECT ... FOR UPDATE`) before reading an
  order's status, closing the race where a redelivered Razorpay webhook could double-
  decrement stock and mint/overwrite a duplicate GST invoice number. `assignInvoiceNumber`
  also reordered to lock before its idempotency check, matching `nextOrderNumber`'s
  already-correct pattern — it was the inconsistent one.
- **The admin's only wired order-status control now notifies customers.**
  `transitionOrderAction` (`/admin/orders/[id]`'s StatusForm) was the sole live path that
  never called `notifyOrderEvent`; the code that did pair a transition with a notification
  (`assignAwbAndShip`/`recordManualAwb`) was never imported anywhere. Both gaps closed —
  the dead fulfilment-notification pairing is also deduplicated into one shared
  `ensureShippedViaPacked` helper.
- **OUT_FOR_DELIVERY notifications are reachable now.** The Shiprocket webhook's dedup
  check used to return early on "already at this status" before ever reaching the
  notification call, silently dropping the out-for-delivery message on every shipment
  that had an earlier IN TRANSIT scan (the common case). Transition and notification are
  now decided separately.
- **Invoice tax-head layout fixed for nil-rated intra-state orders** — `intraState` is now
  computed with `gst.ts`'s own `isIntraStateSupply(shipTo.state)`, the same function that
  decided the real split at order time, instead of being guessed back from tax amounts
  that are indistinguishable (both zero) for an all-nil-rated order.
- **Phone validation fixed and unified.** `9198765432` — a real, valid mobile that happens
  to start "91" — used to be wrongly rejected by `cart-schema.ts`'s blind prefix-strip.
  Extracted the already-correct, length-aware disambiguation from `phone.ts`'s
  `toMsg91Number` into a shared `normaliseIndianMobile`, now used by `cart-schema.ts`
  (server) and `CheckoutForm.tsx` (client) as well — the same rule, decided once, closing
  a real case where the client's "ready to submit" check and the server's validation could
  disagree.
- **System notes no longer overwrite customer notes.** `transitionOrder`'s `note` field
  used to replace `Order.notes` outright, silently destroying a customer's own delivery
  instructions if e.g. a Razorpay order-creation failure appended a system note. Now
  appended.
- **Both webhook bodies are Zod-validated** — Razorpay's with a real schema replacing a
  compile-time-only type assertion; Shiprocket's with a schema loose enough to keep its
  deliberate field-name tolerance (every field optional, `.passthrough()`) while still
  being a real runtime check instead of a raw cast.
- **Combo line "Rate" is now derived from the same authoritative amount printed as
  "Amount"**, not a separate pre-discount subtotal — the two used to disagree even before
  rounding, whenever any discount applied. A small residual (up to `quantity - 1` paise)
  remains possible when a component's apportioned total doesn't divide evenly across its
  physical unit count; documented in place rather than hidden, since eliminating it
  entirely would require misstating either the physical quantity shipped or the amount
  actually charged, both worse.
- **Webhook responses no longer block on the notification pipeline.** Both webhook routes
  used to `await notifyOrderEvent` (SMS + PDF render + email) before returning 200,
  spending the provider's own retry/timeout budget on work the order confirmation doesn't
  need to wait for. Moved to Next's `after()` — unlike a bare unawaited promise, it keeps
  running after the response is sent rather than risking being killed when the serverless
  function freezes.
- **Inventory allocation batched from one round trip per row to one statement per
  transition.** `applySteps` now issues a single `UPDATE ... FROM (VALUES ...)` covering
  every step across every variant on the order, instead of looping `tx.inventory.update`
  per row while holding the interactive transaction's connection open. Discount-usage
  incrementing batched the same way, via `updateMany` (safe here because
  `appliedDiscounts` is already guaranteed duplicate-free — confirmed by reading
  `pricing.ts`'s construction of it before relying on that).

Not fixed as a targeted change: the two "razor blade" efficiency notes about independent
lookups running sequentially (`quoteOrder`'s `resolveCartLines`/`loadDiscountCandidates`,
`notifications.ts`'s WhatsApp/email dispatch) and the JSX-duplication findings
(`TaxSummary`'s intra/inter branches, the storefront/admin order-page address and money
row markup) — real, but lower-stakes than the eleven above, and set aside for a dedicated
pass rather than folded in here.

---

## Built the two gaps the research pass surfaced: a stale-order sweep and rate limiting · 24 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (294 tests, up from 290) and `pnpm build` all
pass.

**Stale-order sweep.** `expireStaleOrders` (`src/lib/orders.ts`) cancels any
`PENDING_PAYMENT` order older than `STALE_ORDER_MINUTES` (60 — not spec, chosen to
comfortably exceed how long Razorpay Checkout stays open on screen), releasing its
inventory hold through the same `transitionOrder` path everything else uses — this is the
missing expiry half of the reservation pattern `inventory.ts` already implements, the same
one Shopify's own published architecture pairs with a cleanup job. `GET
/api/cron/expire-stale-orders` triggers it, guarded by a `CRON_SECRET` bearer token the
same way the Shiprocket webhook guards itself; `vercel.json` schedules it every 15
minutes via Vercel Cron. No new service required — this is a Vercel platform feature, not
an added dependency.

**Rate limiting**, over Upstash Redis (`src/lib/rate-limit.ts`) — built the same way every
other integration in this project was: against documented behaviour, ahead of real
credentials, gated by `isRateLimitConfigured()` so an unconfigured deployment logs a
warning and allows every request rather than breaking checkout the moment this file
existed. `@upstash/ratelimit` + `@upstash/redis` added (REST-based, no persistent
connection needed — works from any serverless runtime). Applied to:

- **Staff login** (`src/auth.ts`) — 5 attempts per 5 minutes, keyed by the *email being
  attempted*, not IP: that is what a brute force actually targets, and is the shared store
  the existing constant-time-dummy-hash comment already said this needed.
- **`submitOrder`** (`src/server/actions/checkout.ts`) — 10 orders per 10 minutes, keyed
  by IP via `headers()`. `quoteCheckout` (read-only, no side effects, called on every
  address edit) is deliberately not limited — throttling it would degrade normal use for
  no abuse-prevention benefit.
- **Both webhook routes** — a coarse per-IP ceiling (60/min Razorpay, 120/min Shiprocket)
  checked before signature/token verification, so raw volume can't spend compute on HMAC
  work. This is a volume floor, not the auth boundary — signature/token verification is
  still what actually gates the request.

`clientIpFrom` split into its own module (`src/lib/client-ip.ts`) for the same reason
`shiprocket-tracking.ts` was split from `shiprocket.ts`: `rate-limit.ts` is `server-only`
(it touches the Upstash token), and Vitest can't import a `server-only` module directly,
so the one pure, testable piece lives apart from it.

Not exercised against a real Upstash account or Vercel Cron in this environment — no
credentials, and cron triggers don't fire outside an actual Vercel deployment. Typechecked
and built against the documented API shapes, same caveat as every other integration this
project has built ahead of its credentials.

---

## Wired the Shiprocket fulfilment actions into the admin order page · 24 August 2026

`pnpm lint`, `pnpm typecheck`, `pnpm test` (294 tests) and `pnpm build` all pass. Closes
the gap Phase 6's own notes named: `pushToShiprocket`, `assignAwbAndShip`, `fetchLabel`
and `recordManualAwb` existed as server actions with no caller anywhere in `src/` —
confirmed by grep before writing anything, so this wasn't guessed at.

**`FulfilmentActions`** (`orders/[orderId]/fulfilment-actions.tsx`, new) — each action
already takes one plain object rather than `(prevState, formData)`, so this follows the
same direct-call pattern `discount-form.tsx`'s preview button already established, not
`useActionState`. Shows push/AWB/tracking state, offers exactly the next legal action
(push → assign AWB → get label), and the manual-AWB fallback stays available throughout
for the DTDC-direct path §10 already accounts for. Rendered only once an order is past
`PENDING_PAYMENT`, matching the existing gate on the status buttons above it.

**`OrderView` gained three fields** (`shiprocketOrderId`, `shiprocketShipmentId`,
`labelUrl`) it needed to know button state but never selected before.

**Fixed the invoice link while in the area.** The page said "invoicing is Phase 6" —
stale copy from before Phase 6 existed — and would have linked through
`Order.invoiceUrl`, which is a real column but is *never populated*: the actual PDF is
served on demand at `GET /api/invoice/[orderNumber]`, deliberately not stored (see that
route's own comment). Fixed to link there instead, session-authorised the same way the
route already supports for staff.

Not exercised against a real Shiprocket account — no credentials in this environment,
same caveat as everything else waiting on them.

---

## Verified under a real production server, not just `pnpm dev` · 24 August 2026

Client confirmed hosting is Hostinger, not Vercel (logged in `DECISIONS.md`) — a
temporary/anonymous Vercel deployment was attempted first and hit an unrelated local
network flake fetching Google Fonts during the build; abandoned once the actual hosting
target was named, since nothing about that attempt was Hostinger-specific anyway.

What actually matters for either host: `pnpm build && pnpm start` runs the app exactly as
a real Node.js process, no dev-mode scaffolding (no Fast Refresh, no `'unsafe-eval'` CSP
exception, minified bundles) — the same process model as Hostinger's managed Node.js
hosting or a PM2-managed VPS process. Ran it and drove it with a real browser:

- Every major route (storefront, admin, checkout, sitemap, robots.txt) returns 200 with
  clean server logs — only the expected pg SSL-mode deprecation notice and the expected
  "no CRON_SECRET configured" rejection.
- Startup: ready in under 2 seconds.
- Logged in, browsed the real seeded catalogue in `/admin/products`, opened `/admin/settings`
  — all against live data, all clean.
- Opened the cart drawer — a client component — and confirmed it renders and animates
  correctly under production's actual CSP (dev's `'unsafe-eval'` exception is gone here).
  **Zero console errors**, where the equivalent `pnpm dev` pass earlier this session had
  the Chromium-autofill `style={{}}` hydration noise. Whether that's because production
  mode genuinely doesn't trigger it or because this run got lucky isn't distinguishable
  from one run — but not a single error surfaced.

This is the closest thing to "how it will actually run" that's checkable without the
credentials or the real host — a materially stronger signal than `pnpm dev` ever was.

---

## Full-surface security/correctness review · 28 August 2026

All four gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test` (302 tests), `pnpm build`.

Four parallel background agents audited money/GST/pricing, auth/session/access,
Cloudinary/uploads/Sentry, and admin-catalogue/discounts respectively, each cross-checked
against research into how real e-commerce platforms handle the same problem. 16 real
findings were fixed; 3 were flagged as business/product decisions rather than bugs (see
`DECISIONS.md` for the full list and reasoning behind each). Highlights:

- A real money exploit in combo pricing (a choiceOf-empty slot let a customer redeem a
  pricier size for a cheaper one's package price) — closed in `resolveComboUnits`, with
  new tests including an explicit "rejected even when the admin listed it in `choiceOf`"
  case.
- Session role/active-status staleness, confirmed independently by 3 of the 4 agents —
  `currentUser()` now re-reads role and active status from the database on every call
  instead of trusting the JWT's claims for the token's lifetime.
- A rate-limit bypass via a spoofed `x-forwarded-for` leftmost hop, and a missing rate
  limit on order lookup-by-phone (confirmed by 2 of 4 agents).
- Cloudinary uploads now actually enforce format and size (verified against the real
  account, not just assumed), and deletes can no longer touch anything outside the
  product's own folder.
- `MAX_PAISE` is now enforced on order-level totals, not just individual line prices; the
  order-number and invoice-number sequences now share one `now` so they can't straddle a
  financial-year boundary independently; a fixed combo slot's own variant is now checked
  for `isActive` the same way the choice-slot path already was; discount priority
  tiebreaking is now deterministic; a discount-usage race that could oversell a limited
  offer is closed with a conditional `UPDATE`; `quoteOrder` and `placeOrder` now agree on
  per-customer discount usage.

Not exercised: Razorpay and Shiprocket remain untestable end-to-end until the store is
hosted and those accounts exist, per the client's own constraint — this round relied on
code review, the existing test suite (extended with new cases for each behavioural fix),
and production-mode (`next start`) verification rather than live third-party calls.

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
