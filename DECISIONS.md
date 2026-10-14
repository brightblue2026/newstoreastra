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

## Phase 2 (partial) — Storefront homepage and motion system

Built from the Cleancult teardown brief. Section architecture and interaction patterns
were taken from it; its tokens, timings and copy were not, where they conflicted with
what already existed here.

- **Dependencies added:** `motion`, `lenis`, `clsx` — the first two named directly in the
  brief. `clsx` came with them and is currently unused by this work.
- **The brief's token block was not adopted.** It proposed a parallel `--bb-navy/blue/sky/
  paper/ink` set that near-duplicates the existing `--color-ink/paper/line/signal` with
  different hexes. Adding it would mean two colour systems. The brief's roles were mapped
  onto the existing tokens instead; only `--color-sky` (section wash) and the seven
  `--color-brand-*` accents are genuinely new.
- **The brief's motion scale was not adopted.** It specified 250/500/800ms on
  `cubic-bezier(.22,1,.36,1)`; globals.css already declared 240/200/120ms on
  `cubic-bezier(.16,1,.3,1)`. Kept the existing curve (visually near-identical) and added
  one duration, `--bb-duration-reveal: 500ms`, because a section entrance and a 2px hover
  lift are different jobs. `src/lib/motion.ts` mirrors the CSS values; the two must not drift.
- **Accent rule held, per the owner's decision.** The brief's §07 "colour wheel" and its
  accent-coloured "Quick add" button both conflicted with the one-accent rule. Accent
  reaches the image field, the card hairline and the brand swatch. Brand labels stay ink
  and every CTA stays `--bb-signal`.
- **Body face stays Satoshi.** The brief nominated Inter, which CLAUDE.md forbids.
- **The italic-serif "collision" word is approximated.** The teardown's signature is a
  script/serif word colliding with grotesque caps. Only Clash Display and Satoshi ship
  here, so the hero's emphasis word uses weight and case within the display face. A true
  third register needs a new font file — not added without asking.
- **`ContentBlock` is the homepage CMS.** The brief asked for a `sections` collection with
  a type discriminator; the schema already had `ContentBlock { key, data Json }`. No
  migration was needed. `src/lib/content.ts` owns one Zod schema per key and a code-level
  default for each. A missing row, malformed JSON or an unreachable database all fall back
  to the default rather than throwing — bad admin input should cost the hero, not the site.
- **Every homepage section guards its own data and renders nothing when empty.** This is
  what lets the page be correct before brands and products exist, with no placeholder art,
  no lorem and no stock photography anywhere in it.
- **No `onQuickAdd` on the homepage grid.** `ProductCard` supports it; the cart is Phase 4,
  and a button that does nothing should not ship.
- **The footer prints a GSTIN only when exactly one active seller entity exists.** §14 Q6
  is open — the same GSTIN is published for two entities — so an ambiguous result prints
  nothing rather than picking one.
- **`PinnedSteps` hoists its per-step `useTransform` into a child component.** The brief's
  version calls hooks inside `.map()`, which lint rejects and which breaks as soon as the
  array length can change. It also collapses to a normal-height stack under reduced motion:
  pinning 300vh of scroll on someone who asked for less motion inverts the request.
- **`CountUp` renders its destination, not zero, and polls the rect on rAF.** Starting at 0
  ships "0 fragrance variants" in the HTML and leaves it there without JS. It only winds
  back to 0 when it starts below the fold, so a tall viewport doesn't paint the figure and
  visibly rewind it. Viewport detection is a rAF rect poll because `useInView`,
  `onViewportEnter` and a hand-rolled IntersectionObserver all failed to fire for that
  element while Lenis was driving the scroll — the same observer fires with Lenis disabled.
  The cause was not identified. Motion's `whileInView`, which drives every `Reveal`, was
  verified to fire reliably at every scroll position, so the reveals still use it.
- **Verified in a real browser over CDP,** not just typechecked: reveals never leave an
  on-screen element transparent at any scroll position; the counter reads 24 in the markup,
  0 → 24 on scroll from below the fold, steady 24 when already in view, and 24 immediately
  under reduced motion.

## Phase 2 (cont.) — Storefront browse

Completes the §12 Phase 2 checklist apart from reviews and a Lighthouse run — see
`PROGRESS.md` for what is verified and what is not.

- **Chrome moved into `(storefront)/layout.tsx`.** The ticker, header and footer were
  built inside the homepage. Nine more pages needed them, so they were hoisted; the brand
  list is now read once per layout rather than once per page, and the mega-menu is
  populated on every route instead of only the homepage.
- **One product-card projection** (`productCardSelect` + `toProductCard`), shared by the
  homepage, /shop, brand, category and search. Four hand-written copies of "take the
  cheapest active variant" is four chances for two surfaces to quote different prices for
  the same product.
- **Price sorting is not done in SQL.** A null `pricePaise` means "Price on request", not
  zero. Postgres sorts NULLs first descending, so `?sort=price-desc` would have opened
  with every unpriced product in the catalogue — which is currently most of it. Priced
  products are ordered in the database and unpriced ones appended, at both ends.
- **Filters are links, not client state.** `lib/query.ts` builds the hrefs; every listing
  page stays a server component, a filtered listing is a shareable, indexable URL, and
  filtering works before JavaScript arrives. Keys are emitted sorted so one result set has
  exactly one URL, and `?sort=featured` is expressed as the absence of the parameter.
- **A category page lists its whole subtree.** "Kerala Spices" showing nothing because
  every product hangs off a child range would read as an empty shop. The tree is walked in
  application code, not a recursive CTE — this catalogue is two or three levels deep — and
  the walk is cycle-guarded so bad data cannot hang the page.
- **The variant picker never dead-ends.** MX-3 is fragrance × size × format. Choosing a
  fragrance that doesn't come in the current size moves to the closest real variant
  (`pickAlong` scores candidates by how many other axes still agree, tie-broken toward a
  priced one) rather than disabling options or landing on nothing. Every state of the
  component corresponds to a variant that exists. An axis with one value renders nothing.
- **JSON-LD omits `offers` entirely when nothing is priced.** Emitting `price: 0` would be
  the structured-data version of the ₹0.00 bug this build exists to fix, and would publish
  a free price into search results. Only variants with a real price become `Offer` nodes.
- **"Price on request" links to a real enquiry address.** `lib/contact.ts` holds the toll
  free number and `info@brightblue.in` from the brief; the mailto carries the product name
  and SKU in the subject. With most of the catalogue unpriced this link is the primary
  conversion path, not a courtesy.
- **`/search` is `robots: noindex, follow`** and is excluded from the sitemap — listing a
  page that tells crawlers to go away wastes crawl budget. It is a plain GET form: no
  debounce, no fetch-as-you-type. Search also matches `variantName`, so "lemon" finds the
  MX-3 fragrance rather than only products with "lemon" in the title.
- **`/story` and `/stockists` were built because the header already linked to them.** Both
  404'd. The story page reuses the same `home_story` and `world_record` content blocks as
  the homepage rather than duplicating the copy. Stockists with no rows prints the toll
  free number, never an invented shop list.

### Cart wiring (Phase 3 surface, brought forward)

§12 Phase 2 lists "sticky mobile add-to-cart" on the product page, which cannot be honest
while the drawer renders a hardcoded empty state. So the drawer was wired up:

- **`src/server/actions/cart.ts`** — `readCart` Zod-validates the line refs and calls the
  existing `priceCart`. Every rupee in the drawer is re-read from Postgres; the client
  sends ids and quantities only. This is Phase 3's "server-side recomputation on every
  cart read".
- **Priced lines are collapsed back to one row per cart line.** `priceCart` explodes a
  combo into one line per component so each carries its own HSN and GST rate — correct for
  tax, wrong for a drawer, where a three-component combo is one thing the customer chose.
  Rows are grouped by `kind:id` and their money summed rather than recomputed, so the
  drawer reconciles exactly with the total.
- **Offer names come from `Discount.publicLabel`,** looked up in the action rather than
  threaded through `calculateCart` — keeping that function pure and database-free is what
  makes it testable. `Discount.name` is marked internal in the schema and is never shown.
- **`useCartDrawer` is a second, unpersisted store.** "The drawer was open when I closed
  the tab" is not state worth restoring, and add-to-cart fires from a product page far
  down the tree, so open/closed could not stay in `StorefrontChrome`'s local state.
- **The cart badge is gated behind a mount flag.** The cart lives in localStorage, which
  the server cannot see, so rendering the real count on the first pass is a hydration
  mismatch.
- **No checkout button.** Checkout, payment and the order transaction are Phase 5. The
  drawer shows a subtotal and says delivery and taxes are calculated at checkout.
- **Combo choice slots are shown but not selectable.** `CartLineRef` is `{ kind, id,
  quantity }` — there is nowhere to record "for slot 2 they picked Jasmin". A picker whose
  choice was silently dropped would be worse than none, so the options are displayed and
  the slot says the selection is confirmed before dispatch. Per-slot pickers need a cart
  shape that can hold choices; that is Phase 4.

## Phase 4 — Combo choice slots and coupon entry

Completes the §12 Phase 4 checklist. The combo builder, the live saving panel, the
discount admin and the mandatory discount preview were built in Phase 1; these are the
two customer-facing halves that were left as "needs a cart shape that can hold choices".

- **A cart line is now identified by `cartLineKey`, not by `kind:id`.** Two lines of the
  same combo with different fragrances are two different things to buy, so id alone can no
  longer address a line — the quantity stepper, the remove button and the server's
  regrouping of exploded component lines all key off it. `src/lib/cart-line.ts` holds the
  shape and the key function, outside `cart-store.ts` because both the client store and the
  server pricing path need them and `cart-store.ts` is `'use client'`.
- **Choices are normalised before keying.** Slots sorted by id, picks sorted within a slot:
  two Lemon and one Rose is the same package however the customer clicked, so it merges
  with an existing line rather than opening a second one. A combo with no choice slots
  still keys as plain `COMBO:<id>`, which is exactly what carts saved before pickers
  existed already are — so nobody's cart breaks.
- **A choice slot with `quantity: 3` asks three times, and repeats are allowed.** "Any 3
  MX-3 fragrances" is one `ComboItem` with `quantity: 3`, so `ComboChoice.variantIds`
  carries one id per unit rather than a set. Three bottles of Lemon is a real order.
- **Every pick is re-validated server-side** in `src/lib/combo-choice.ts` — active variant,
  active product, inside `choiceOf` when the admin restricted the slot and otherwise a
  variant of the slot's own product, exactly as many picks as the slot has units, **and no
  more expensive than the slot's own variant** (added 24 August 2026 — see below; this
  entry originally claimed "a forged choice buys nothing cheaper," which was true only
  when every variant of a product shares one price. MX-3's real catalogue doesn't: 24
  fragrances × 3 sizes under one product id, at three different prices. A choiceOf-empty
  slot let a customer pick a pricier size for the smaller size's package price — a real
  underpayment, not just an unintended fragrance — found by a security-review agent, fixed
  by comparing `pricePaise` on every pick, including against an admin's explicit
  `choiceOf` list, since a restriction list naming the wrong size's id by mistake
  shouldn't reopen the same hole. A null price on either side can't be compared and is
  refused rather than assumed safe.). The
  resolution is a pure function in its own module precisely so it can be tested without a
  database, which is the only kind of test this environment can run.
- **An unresolvable choice makes the line unavailable rather than substituting the slot
  default.** A fragrance deactivated, a slot resized since the line was added and a tampered
  payload all arrive the same way and all have the same honest fix: pick again. Silently
  shipping a different fragrance from the one on screen is worse than saying so.
- **The pricing engine's line ordering is now a documented, tested contract.**
  `PriceResult.lines` was always 1:1 with the input in order; `cart-pricing.ts` now depends
  on it, returning a `lineKeys` array index-aligned with the priced lines so a combo's
  exploded components regroup into the row the customer chose. Grouping by combo id alone
  would merge two lines of the same combo bought with different fragrances. Asserted in
  `pricing.test.ts` rather than left as folklore.
- **`ComboItem` has no sort field**, so both `getComboBySlug` and `priceCart` now order
  items by id. Without it the choice slots could swap places between requests, and the
  drawer's slot labels would stop matching the pickers that produced them.
- **The coupon code lives in the cart store**, persisted alongside the lines, so it survives
  navigation and a reload the way the cart does. It is only ever a string the customer
  typed; whether it means anything is `calculateCart`'s decision.
- **One message for every kind of invalid coupon.** A code that does not exist, has expired,
  has not started, is out of uses, or whose minimum order this cart does not meet all
  surface as `invalidDiscountCode`. The drawer says the code is not valid *for this cart*
  rather than claiming it does not exist — the last case is a cart the customer can fix,
  and telling them the code is wrong would be a lie.

## Phase 5 — Checkout, payments, orders

Completes the §12 Phase 5 checklist apart from phone OTP and the MSG91 submission itself —
see `PROGRESS.md` for what is verified and what is not.

### Settings, and the two open questions that turned out to be data entry

- **A `Setting` model was added** (`key`, `data Json`, `updatedAt`) — not in §7. §10 says
  the COD controls live "in admin settings" and there was nowhere for them to live. Same
  key + validated-JSON shape as `ContentBlock`, kept as a separate table because it is not
  content: it decides what a customer is charged, and it is ADMIN-only where content is
  MANAGER-editable. Migration `20260808120000_phase5_settings`.
- **Migrations are now authored offline.** There is no database in this environment, so the
  migration SQL was generated with `prisma migrate diff --from-schema <snapshot> --to-schema
  prisma/schema.prisma --script`, which needs no shadow database. Worth knowing:
  `--from-schema-datamodel` was removed in Prisma 7 and the replacement is `--from-schema`.
- **Every settings default is safe rather than plausible.** §14 Q17 (COD fee, bounds,
  pincodes, weight slabs) is unanswered, so nothing here guesses a number. COD ships
  **disabled** — a fee nobody set and an allowlist nobody drew are worse than the option
  being absent. The slab table ships **empty**, which charges nothing for delivery; that is
  a real cost, so `/admin/settings` says it in as many words rather than letting free
  delivery be a silent default. Refusing every order until someone configures a slab was
  the alternative, and it makes the store unusable to fix a number that takes one screen.
- **No free-shipping threshold in settings.** `FREE_SHIPPING` is already one of the five
  `DiscountType`s and `cart-pricing.ts` already derives the drawer's progress bar from
  whichever real discount configures it. A second threshold in settings would be a second
  source of truth for the same number, and the two would disagree the first time one
  changed. `/admin/settings` says so and links to the discount screen.
- **§14 Q6 is resolved by a mechanism, not a guess.** `/admin/settings` has a
  seller-of-record form: an ADMIN picks one active entity and enters its GSTIN, and saving
  clears `isSeller` on every other entity in the same transaction — so
  `resolveSellerEntity`'s "exactly one" is something the UI cannot violate rather than
  something it hopes for. Until one is set, `placeOrder` throws `OrderConfigurationError`
  and checkout says orders are not being accepted, because an order that can never be
  invoiced should not be taken. The GSTIN is format-checked (15 characters) but deliberately
  **not** checked for uniqueness across entities: the published duplicate is the open
  question, and once only one entity is the seller, what the others carry stops mattering
  for invoicing.

### Pincode, state and tax

- **`src/lib/pincode.ts` is an offline prefix → state table, and it is deliberately
  incomplete.** The delivery state decides CGST + SGST versus IGST, so it must not depend on
  a third party's uptime — but a wrong entry charges the wrong tax, while an unknown one
  costs the customer a dropdown. So a prefix resolves only where the whole series belongs to
  one state; a shared series (`24`/`26` Uttar Pradesh–Uttarakhand, `81`/`82`
  Bihar–Jharkhand, `605`/`609` Tamil Nadu–Puducherry, `396` Gujarat–DNHDD, `16`, `19`)
  returns `ambiguous` with the candidates named, and anything unlisted returns `unknown`.
- **Longest prefix wins,** which is what keeps the union territories sitting inside a
  state's series correct: Goa's `403` inside Maharashtra's `40`, Sikkim's `737` and the
  Andamans' `744` inside West Bengal's, Lakshadweep's `68255x` and Mahé's `673310` inside
  Kerala's own. "68 is Kerala" is not good enough for tax, and Kavaratti is the proof.
- **A definite pincode overrules the customer's selected state.** Otherwise selecting Kerala
  for a Bengaluru pincode turns an IGST order into a CGST + SGST one. Where the series is
  shared the selection stands but must be one of that series' candidates. A test asserts
  every state named in the table resolves through `gst.ts` — a typo would silently become an
  inter-state supply, because `isIntraStateSupply` treats an unrecognised state as
  inter-state.
- **City is not auto-filled.** That needs a real pincode database and is Phase 6's
  Shiprocket lookup. The state is the field that matters for money, and it is the one filled
  in.

### Shipping and inventory

- **`rateShipping` is pure and is currently the only rate source.** §10 makes the flat-rate
  slab table the fallback for when Shiprocket is down; at Phase 5 Shiprocket does not exist
  yet, so it is also the primary. Phase 6's job is to try Shiprocket first and fall back to
  this, not to replace it. The narrowest slab that holds the weight wins, bounds are
  inclusive, and an out-of-order table is sorted rather than trusted.
- **An unweighed variant counts as `defaultUnitGrams`, not as nothing.** Most of the
  catalogue has no `weightGrams`; skipping those lines would land a heavy order in the
  lightest slab.
- **A variant with no `Inventory` row is not blocked.** Almost nothing is stocked in the
  database yet and treating "no row" as "no stock" would reject every order. An untracked
  variant reserves nothing and ships — the honest reading of an empty table is "nobody is
  counting this".
- **Allocation ignores `Location.handles`.** Whether food ships from Thrissur or Malappuram
  rather than Palakkad is §14 Q19 and unanswered, so stock is drawn deepest-row-first from
  wherever there is stock rather than guessing a routing rule.
- **The reservation is not recorded per location.** Release and restock re-plan against
  freshly read rows — most-reserved first, deepest first — clamped so `reserved` cannot go
  negative. Per-location drift is possible; the global count, which is the only thing that
  decides whether the next order can be accepted, stays right. Recording the original
  allocation would need a field §7 does not have.

### The order transaction

- **Order numbers are gapless without a counter table.** A transaction-scoped advisory lock
  per financial year (`pg_advisory_xact_lock(hashtext('bbtc:order-number:2627'))`)
  serialises read-then-insert, and the next sequence is derived from the highest *committed*
  number — so a rolled-back transaction leaves no gap, because it never held a number. The
  five-digit zero padding is what makes a lexicographic `ORDER BY DESC` the same as a
  numeric one.
- **The §4 read-and-price steps moved inside the transaction.** `resolveCartLines` and
  `loadDiscountCandidates` now take an optional `Prisma.TransactionClient`; reading through
  the singleton would put "re-read prices" outside the transaction that inserts the order,
  and a price edited in between would be a price the order silently disagrees with.
- **`resolveComboUnits` is now generic over the variant row.** `cart-pricing.ts` needs the
  SKU, weight and image off the *same rows* choice resolution validates, and threading the
  row type through returns them with those fields intact instead of a cast that would
  quietly become a lie if the query changed.
- **A combo becomes one `OrderItem` per component, not one per package.**
  `OrderItem.hsnCode` and `gstRate` are not nullable and a bundle has neither of its own, so
  the alternative was inventing an HSN for a mixed package. Each component line carries its
  own HSN and rate and the combo's id; `comboId` puts the package back together for display,
  and keeping the components apart is what lets a mixed-rate invoice reconcile line by line.
  `nameSnapshot` reads "Festive Trio — MX-3 Dish Wash Lemon", so an invoice line is
  self-describing.
- **`OrderItem.totalPaise` is net of every discount,** including that line's share of an
  order-level one, so the items sum to exactly what was charged for goods. `unitPricePaise`
  is `round(subtotal / quantity)` — display-only, since `totalPaise` and `Order.taxByHsn`
  are what reconcile.
- **A COD order is created `CONFIRMED`,** not `PENDING_PAYMENT` — there is no payment to
  wait for — and its stock hold is committed in the same transaction.
- **The Razorpay order is created *after* the transaction commits,** and attached in a
  second write. A network call inside a database transaction holds locks for as long as a
  third party takes to answer. Creating it first would be worse: a database failure would
  leave a payable order Razorpay knows about and this database does not, which is money
  taken against nothing. If Razorpay cannot be reached the local order is cancelled
  automatically — releasing the stock hold and keeping the order list honest about what is
  collectable — and the customer is told to try again.
- **`perCustomerLimit` is enforced from the `appliedDiscounts` snapshot** on the customer's
  past orders, via one `jsonb_array_elements` aggregate, excluding cancelled and refunded
  orders: a coupon on an order that never happened has not been spent. No counter table,
  because the snapshot already is the record of what was granted. Only reachable for a
  signed-in user, which today means staff — there is no customer login yet.

### Payments

- **No Razorpay SDK.** §5 locks the *provider*, not a client library, and the package wraps
  two REST calls and an HMAC. This is `fetch` plus `node:crypto`, so the dependency list
  stays where it was. Razorpay's API unit for INR is the paise, which is this codebase's
  unit, so nothing in `razorpay.ts` multiplies by 100 — and it says so, because that is the
  classic bug.
- **`createRazorpayOrder` rejects an echoed amount that differs from what was sent.** Cannot
  happen with a correct request, and must never pass silently if it does.
- **Signature verification fails closed.** No signature, no configured secret, a length
  mismatch or non-hex input all return false, and the compare is `timingSafeEqual`. A test
  asserts that the same payload re-serialised with its keys in another order fails, which is
  why the route handler reads `req.text()` before it parses anything.
- **`PENDING_PAYMENT → CONFIRMED` is reachable only by actor `'WEBHOOK'`** in
  `order-status.ts`. Not by an admin button, not by the browser's success handler, not by an
  ADMIN — §10 has no exception for seniority. The guarantee lives in the state machine, so
  it does not depend on the webhook route being its only caller.
- **The browser's success handler clears the cart and navigates. It marks nothing paid.**
  The confirmation page reads the real status, so it says "confirming the payment" until the
  webhook lands and "Confirmed" afterwards. A page that congratulated a customer on a
  payment that later failed would be the visible form of trusting the client.
- **Webhook idempotency is two-layered:** matched first by `razorpayPaymentId`, then by order
  state — `transitionOrder` treats a move to the status an order is already in as a no-op, so
  a replay cannot decrement inventory twice. A signed event for an unknown order is
  acknowledged with 200 and logged loudly, so Razorpay stops retrying something no retry will
  fix; a failure on our side returns 500 to ask for it again.
- **`payment.failed` moves `paymentStatus` only, never `status`.** A failed attempt is not a
  cancelled order — the customer can try again on the same one.

### The customer-facing surfaces

- **An order page is not readable by order number alone.** Numbers run in sequence, so
  `BB-2627-00001` cannot be the credential. Access comes from an HMAC capability token
  minted at placement and carried in the URL, or from the **full ten-digit** mobile number on
  the order. Not the last four: there is no shared rate-limit store in this deployment, and
  four digits against a sequential number is a few thousand guesses. The token does not
  expire — it is a link a customer keeps, and an order they can still see next month is the
  point.
- **The unlock form gives one message for a wrong number and for an order that does not
  exist.** A form that distinguishes them tells a stranger which order numbers are real.
- **`/order` and `/order/[orderNumber]` need no client JavaScript.** Both are server
  components with a plain form action, which is also what makes them work for a customer on
  a bad connection opening a WhatsApp link.
- **Checkout is three sections of one form, not three routes.** A customer can go back to a
  field without losing the rest, and it is one submit. Every rupee shown comes from
  `quoteCheckout` and is recomputed a third time inside the transaction; the browser sends
  ids, quantities, an address and a payment method, and never a total.
- **A payment method that stops being available is deselected.** COD switched off, or a
  pincode outside its allowlist, silently reverts the choice to online payment rather than
  letting a customer submit an order the server will refuse.
- **The cart drawer's checkout button is a `Link`.** The cart it carries is already in the
  store and the checkout page re-prices from Postgres on arrival, so there is nothing to
  post.
- **STAFF can see order totals.** §6 bars STAFF from prices, products and discounts — not
  from what an order came to. They have to print invoices and hand parcels to couriers, and
  neither is possible otherwise.

## Phase 6 — fulfilment, invoices, communications

- **The invoice number is taken at confirmation, not at placement.** §10 says "generated
  inside the order transaction" and §12 says "no gaps". For a prepaid order those pull
  apart: an order created in `PENDING_PAYMENT` that is never paid would have consumed a
  number, and cancelling it puts a hole in a series that is legally required not to have
  one. So it is taken in whichever transaction moves the order to `CONFIRMED` — which for a
  COD order *is* the creation transaction, because a COD order is created confirmed. Both
  readings hold, and an order that never became a supply never held a number.
- **An invoice number, once raised, is never released.** A cancellation after confirmation
  keeps its number. Under GST that is right — a raised invoice is reversed with a credit
  note, not deleted or reused. Credit notes are out of v1 scope, so that reversal is
  currently manual, outside this system.
- **`BBTC/2627/00001`, not `BB/INV/2627/00001`.** CGST Rule 46(b) caps a tax invoice number
  at sixteen characters; the more readable form is seventeen. It also must not be mistakable
  for an order number (`BB-2627-00001`), so both the prefix and the separator differ rather
  than just one. Asserted in a test at the maximum sequence.
- **The invoice PDF recalculates nothing.** Every figure comes from the order's stored
  snapshot and `taxByHsn`. A renderer doing its own arithmetic could disagree with what the
  customer was charged, and then the invoice would be the thing that was wrong.
- **Intra-state and inter-state invoices have different tables, not one table with empty
  columns.** A zeroed CGST column beside a filled IGST one invites the reader to wonder
  which is correct.
- **Delivery, FSSAI and cosmetics licences are looked up live; everything else is
  snapshotted.** A licence is a property of the business, not of the sale, and a regulator
  wants the current one. The consequence — reprinting an old invoice after a renewal prints
  the new number — is the right direction.
- **`delivery.ts` distinguishes "nobody delivers there" from "we could not find out."**
  `rateShipment` returns an empty courier list for the first and `null` for the second.
  Treating an unreachable Shiprocket as unserviceable would refuse orders BBTC can fulfil
  every time the API blinks, which is exactly what §10's "never block an order because a
  third party is down" forbids.
- **Live Shiprocket rating is off by default.** A live rate nobody has compared against the
  slab table could quietly charge more or less than BBTC intends. An admin turns it on after
  looking at both.
- **The delivery rate is settled before the order transaction opens.** It may call
  Shiprocket, and a network call inside a transaction holds locks for as long as the third
  party takes to answer. The cost is pricing the cart twice — once for a weight outside, once
  authoritatively inside.
- **Every notification is dispatched after the transition commits, never inside it.** A paid
  order must not roll back because Resend timed out; equally, a customer must never be told
  about a transition that did not commit. `notifyOrderEvent` swallows its own failures so it
  cannot turn a successful confirmation into a retry.
- **The Shiprocket webhook acts as `'STAFF'`, not `'WEBHOOK'`.** Shiprocket authenticates
  with a shared header token, which is weaker than Razorpay's HMAC over the body. As a STAFF
  actor it cannot reach `CONFIRMED` however it is called, because `order-status.ts` reserves
  that transition for `'WEBHOOK'`. A test also asserts the status map cannot even name it.
- **A tracking scan that cannot be applied returns 200, not an error.** Shiprocket re-sends
  scans, and a `DELIVERED` arriving after staff marked an order `RETURNED` is expected
  traffic. A non-2xx would make it retry something that can never succeed.
- **An AWB can be entered by hand.** BBTC already ships DTDC directly, and §10's rule about
  third parties applies to dispatch as much as to checkout. The manual path moves the order
  and notifies exactly as the automatic one does.
- **The invoice is rendered on demand, never stored.** `Order.invoiceUrl` exists in the
  schema, but the document derives entirely from immutable snapshots, so re-rendering is
  deterministic. Storing a copy would add a bucket to keep in sync with no reader asking
  for it.
- **Pure logic lives outside the `server-only` modules.** `shiprocket-tracking.ts` and
  `phone.ts` were split out of `shiprocket.ts` and `msg91.ts` so they can be unit tested —
  `server-only` throws on import under Vitest. Same pattern as `combo-choice.ts` and
  `cart-pricing.ts`.
- **The CSP had to be widened for Razorpay, and that was a live bug, not a precaution.**
  The CSP and the checkout screen were built on separate branches; `default-src 'self'`
  blocked `checkout.razorpay.com` and the payment iframe outright. Nothing surfaced until
  the Pay button. Five directives widened with the reason for each recorded in
  `next.config.ts`.

## bbtcglobal.com reviewed · 16 August 2026

Full extract in `docs/bbtcglobal-catalogue.md`. One page; the sitemap has a single URL.

- **The site is a secondary source, ranked below the client's documents.** It carries no
  prices, no HSN codes, no pack sizes for half the food range, and does not name the 24 MX-3
  fragrances the label photographs already gave us. Where the two disagree the documents
  win — brightblue.in's brochure was already wrong once about MX-3 sizes.
- **There is an eighth brand, MAKAFA (perfume).** Named in BBTC's own copy, absent from the
  master brief §3/§11, the seed, and this repo entirely. `CLAUDE.md` corrected from seven
  brands to eight. **Seeded on the client's instruction, 16 August 2026** — `Segment` gains
  `FRAGRANCE` (migration `20260816090000_segment_fragrance`; appended to the enum because
  `ALTER TYPE … ADD VALUE` cannot reorder, and display order comes from `sortOrder` anyway).
  **Its accent `#6B4E9E` is the one invented colour in the seed** — every other came from the
  client's frontend spec, which predates MAKAFA. Chosen to sit clear of Rafasi's `#7C5CD6`;
  replace it when real perfume artwork arrives. No MAKAFA products: the site names none.
- **`Fairoze` confirmed over `FAIROZ`,** 16 August 2026. The site uses both; the client
  confirmed Fairoze, which is what was already seeded, so nothing changed.
- **The storefront's own copy said "seven" in six visible places** — the homepage and shop
  headings and four `content.ts` defaults, including the announcement bar. All corrected to
  eight, and the segment lists that read "cleaning, personal care and food" now name
  fragrance. Also `'24 fragrances of MX-3'` → `'24 fragrances of MX-3 dishwash'`: with a real
  perfume brand in the portfolio, the unqualified line attributes the world record to the
  wrong product. The admin brand form's hardcoded `SEGMENTS` array needed the new value too —
  the Zod schema derives from `Object.values(Segment)` and picked it up on its own, but the
  `<select>` did not, so no admin could have set a brand to Fragrance.
- **Rafasi's Front Load / Top Load stays descriptive text on the variant, not a schema
  field.** Client's call, 16 August 2026. It is neither a size nor a fragrance, so a
  structured third axis would have meant a migration and a multiplied SKU count for one
  brand. The cost is that load type is not filterable — acceptable while Rafasi has two
  formulations. Revisit if a second brand acquires the same split.
- **Two Kenzaniya products sit outside both FSSAI registrations.** Himalayan Pink Salt and
  Marayoor Sharkara are covered by neither `21325201000650` (Biscuit, Tea) nor
  `21326201000001` (Ghee, Pickles, Rice, Wheat, Millets, Chia seeds, flours, bread). Multi
  Sweet Seed Mix and the caffeine-free Herbal Tea Bags are arguable. BBTC is publicly
  marketing these today, so this is a live compliance question about the business, not just
  a publish-gate question for the store. Raise it with the client alongside the ₹12 lakh
  turnover cap.
- **The Kaloor head-office address is not a GSTIN conflict.** The site gives Kaloor; the GST
  registration's principal place is Pullepady. Kaloor is one of the four additional places of
  business on the same GSTIN, so both are real. Invoices keep the principal place.
- **Five new group companies appear** (Hanna Productions, Ilfa Productions, AGP Enterprises,
  Hannasagar Productions, Shine Links Productions). None is evidenced as a seller of record,
  so `Entity.isSeller` is untouched.

## Open questions blocking real catalogue data

Per §14. Client supplied source documents on 9 August 2026 (trade licence, two FSSAI
registrations, GST registration, and 28 product-label photographs) that answer four of
the original six directly from primary evidence rather than reconciling two secondary
sources. Kept for the record; resolutions below cite the document each answer came from.

1. **MX-3 sizes — resolved.** 225 ml, 450 ml, 900 ml. Confirmed by three price-tag photos
   dated 9 August 2026 (batch 10075, MFG 18/7/2026): ₹52 / ₹104 / ₹207, a constant ₹0.23
   per ml across all three — the brochure was right, brightblue.in's 250 ml/500 ml/1 L was
   stale.
2. **MX-3 fragrance list — resolved.** Exactly 24, confirmed by one label photo per
   fragrance (28 photos covered 24 distinct fragrances, several at more than one size):
   Strawberry, Grapes, Green Apple, Orange, Green Lemon, Guava, Pineapple, Blue Berry,
   Litchi, Lemon, Green Mango, Pista, Green Papaya, Mango, Avocado, Mixed Fruits, Kiwi,
   Peach, Apple, Pomegranate, Cucumber, Butterfly Pea, Olive, Passion Fruit. Barcodes
   7860001–7860016 cover 16 of them; the other 8 (Kiwi, Peach, Apple, Pomegranate,
   Cucumber, Butterfly Pea, Olive, Passion Fruit) carry `BBTC-01xx` codes instead — two
   different coding generations in concurrent use, not an error.
3. **Liquid vs Semi-Gel — still open.** Every one of the 28 labels reads "LIQUID"; none
   photographed is Semi-Gel. Liquid is confirmed real. Whether Semi-Gel is a real second
   line is not evidenced either way yet — not claiming it doesn't exist, just no photo of
   it.
4. **FSSAI licence number and scope — partially resolved.** Two **Basic Registrations**
   exist (not a State or Central *Licence* — that distinction matters, see below):
   - `21325201000650`, "BBTC Foods and Beverages", valid 29-12-2025 to 28-12-2030, scoped
     to exactly two categories: **Biscuit, Tea**.
   - `21326201000001`, "BBTC Foods Products", valid 01-01-2026 to 31-12-2030, scoped to
     Ghee, Pickles (fruit/vegetable/mixed/fish), Pickled eggs, Cured/pickled meat, Rice,
     Wheat, Millets, Chia seeds, Arrowroot, maize flour, mixed millet flour, multigrain
     atta, ragi flour, barley flour, bread.

   Neither document names "Kenzaniya" or "Ilfa Valley" — FSSAI registers food categories
   and an FBO, not brand names, so that was never going to be answered directly. What
   **is** new and load-bearing: **a Basic Registration caps annual turnover at ₹12 lakh,
   per-registration, stated on the certificate itself.** An online store that grows past
   ₹12 lakh/year in food sales under either registration needs a State or Central FSSAI
   *Licence* before that happens, not just before launch. This is a real business
   ceiling, not a paperwork formality — worth surfacing to the client directly, not just
   filing away in this doc.
5. **Cosmetics licence for Fairoze — still open.** No cosmetics licence document was
   supplied. Unresolved.
6. **Seller of record and the GSTIN — resolved, and simpler than feared.** GSTIN
   `32DCVPK7871P1ZI`, legal name **Faisal Vathyedath Kunjimuhammed**, trade name
   **Bright Blue Trading Corporation**, constitution **Proprietorship** (not a Pvt Ltd or
   LLP), principal place 66/927 Pappurath, Krishnaswamy Road, Pullepady, Kochi, Kerala
   682035, with **four additional places of business under the same single GSTIN**
   (Chengaram/Palakkad, Ozhur/Malappuram, Kasaragod, Kaloor/Ernakulam). There was never a
   duplicate-GSTIN conflict — brightblue.in's brochure data was simply wrong. §11's
   separately-named "Bright Blue Manufacturing Pvt Ltd" *does* appear independently, but
   as the **manufacturer** on product labels (its own licence number,
   `BFIF04-G091202-00119-2025`, not a GSTIN) — a normal manufacturer/seller split, not a
   second seller entity. For invoicing: `Entity.isSeller = true` belongs on **Bright Blue
   Trading Corporation** alone, with `gstin = 32DCVPK7871P1ZI`. See the entity backfill
   below.

### Entity data backfill · 9 August 2026

The three entities seeded in Phase 1 (`Bright Blue Manufacturing Pvt Ltd`, `Bright Blue
Marketing Associates LLP`, `Bright Blue Chemicals LLP`) were seeded with `gstin` and
`isSeller` deliberately unset, per open question 6 being unresolved at the time. Now that
it's resolved: a fourth entity, **Bright Blue Trading Corporation**, was added with the
real GSTIN and `isSeller: true`. The other three are left as they were — real names that
appear on real documents (Manufacturing Pvt Ltd is the licensed manufacturer on every
label), just not the invoicing party, so `isSeller` stays `false` on them rather than
being guessed either way.

### Real MX-3 catalogue seeded · 9 August 2026

`Brand` (MX-3), `Product` (MX Three Dish Wash Liquid) and 72 `ProductVariant` rows (24
fragrances × 3 sizes) were added from the resolved data above — real names, real prices
(₹52/₹104/₹207 inclusive of tax, from the photographed price tags), real ingredient list
(off the label's INGREDIENTS line). Left as **drafts** (`isActive: false`) and **without
an HSN code or GST rate** — no label or document supplied one, and §7 is explicit that
`hsnCode` stays null until the accountant confirms it rather than being guessed at. This
is also why the publish guard still blocks these from going live: it requires an HSN
code, which is correctly absent.

SKUs for the 8 fragrances where only one size was photographed (Kiwi, Peach, Apple,
Pomegranate, Cucumber, Butterfly Pea, Olive, Passion Fruit — all carry `BBTC-01xx` codes)
were only confirmed at the sizes actually shown in a photo; the other sizes for those
fragrances use a synthesized internal SKU (`MX3-<FRAGRANCE>-<SIZE>`) rather than a
fabricated barcode, because inventing a barcode risks colliding with a real one the
business already uses elsewhere. Swap in the real code once the full size × fragrance
barcode sheet is available.

### How the resolved seller reaches an order · 9 August 2026

Phase 5 was built before the answer to question 6 arrived, so it does not hardcode it: an
ADMIN marks the seller of record and enters its GSTIN in `/admin/settings`, and
`resolveSellerEntity` refuses to take an order until exactly one entity is marked with a
GSTIN on it. That mechanism stays. It is now satisfied by real data rather than waiting on
it — **Bright Blue Trading Corporation, `32DCVPK7871P1ZI`** — and the same screen remains
the place to correct it without a deploy.

### Open question 3 resolved, open question 5 deferred by scope · 21 August 2026

Client confirmed directly (not from a photographed document):

- **Semi-Gel is a real second MX-3 format**, alongside Liquid. Resolves open question 3.
  No size, price or SKU data for it has been supplied yet, so nothing has been seeded —
  seeding it with guessed prices would repeat the exact mistake §7 forbids. Blocked on the
  same kind of source data Liquid got (label photos or a price-tag photo) before
  `seed-mx3.ts` gains a `format: 'Semi-Gel'` variant set.
- **Catalogue work is scoped to MX-3 only for now.** The other six brand shells (seeded in
  `bacba59`) stay as shells — no products under them yet. This makes open question 5
  (Fairoze cosmetics licence) not currently blocking: Fairoze has no products in flight to
  be blocked. Revisit when work moves past MX-3.

### bbtcglobal.com / brightbluefmcg.com domain roles · 22 August 2026

Client named the real production domain for the first time this session: **the store is
hosted at brightbluefmcg.com**, not brightblue.in (the old WooCommerce site) or
brightblue.vercel.app (the brand site named in the master brief) or bbtcglobal.com. This
partially resolves open question 15 ("one property or two?") — the store's domain is now
known — but bbtcglobal.com's exact relationship to brightblue.vercel.app is still
unconfirmed.

Fetched bbtcglobal.com directly (client's instruction) to cross-check contact/company
details against the brochure-sourced master brief:

- **Toll-free `1800 123 0621` confirmed** — matches the brochure and the already-live
  `CONTACT.tollFree`. No change.
- **Site email is `bbtcglobal@gmail.com`** — but the client separately gave the *store's*
  email directly as `store-brightbluefmcg@gmail.com`. Different addresses, different
  properties. `CONTACT.email` (`src/lib/contact.ts`) and `RESEND_FROM_EMAIL`
  (`.env.example`) now use the store address per the client's explicit instruction, not the
  corporate-site one. **`store-brightbluefmcg@gmail.com` is a Gmail address — Resend cannot
  send transactional mail *as* a gmail.com address** (Google doesn't authorize Resend's
  servers for gmail.com's SPF/DKIM). This will need either a real domain mailbox
  (`orders@brightbluefmcg.com`, DNS-verified in Resend) with the Gmail address used only as
  a reply-to/contact-display address, or sending through Google's own SMTP instead of
  Resend for this address specifically. Flagged, not resolved — needs a decision before
  Phase 6 email actually ships.
- **An eighth brand: MAKAFA** (Premium Perfume & Fragrance) — not in the brochure, not in
  the master brief, not seeded. Confirmed real by the client 22 August 2026. Noted in
  `CLAUDE.md` as in-scope-for-later; **not seeded now**, consistent with the MX-3-only
  scope decision above.
- **Legal entity name conflict, left unresolved.** bbtcglobal.com lists "Bright Blue
  Trading Corporation **Pvt Ltd**." The GSTIN already backfilled (`32DCVPK7871P1ZI`, from
  the actual GST REG-06 certificate) is registered to a **proprietorship** — no "Pvt Ltd,"
  proprietor Faisal Vathyedath Kunjimuhammed. A GST certificate outranks a website's About
  page, so the seeded entity is **not** being changed over this. Flagging for the client to
  confirm which is correct for invoicing — if a Pvt Ltd entity is real and distinct from the
  proprietorship, that changes who the seller of record actually is.
- **Head office pincode, now a three-way conflict.** Brochure header said 682035, brochure
  footer said 682018, bbtcglobal.com now says **682017**. Still unresolved — the seeded
  entity keeps the GST-certificate-backed 682035 pending a real answer, not the website's.
- Several office addresses appear on bbtcglobal.com that aren't in the master brief's table
  (UK office on High Holborn Street London, two Thrissur food offices, a Malappuram
  packing centre, a second Kasaragod office). Not acted on — none of these affect the
  seeded seller entity, and none was asked about specifically.
- `organizationJsonLd.sameAs` (`src/app/layout.tsx`) changed from `brightblue.in` to
  `https://www.bbtcglobal.com` — the old site is being replaced, not a property search
  engines should be pointed at; bbtcglobal.com is confirmed live and real.

### Bulk variant entry on product creation · 21 August 2026

Client asked for a way to add a product's variants — not one at a time via
`/admin/products/[id]/variants/new` — in the same screen that creates the product, so
that once real Semi-Gel data arrives it (and any future brand's launch catalogue) doesn't
mean dozens of separate page visits. Added `variant-rows.ts` (pure parsing/validation,
unit tested) and `variant-rows-field.tsx` (the repeatable row UI) under
`src/app/admin/(panel)/products/`; `createProductAction` now accepts an optional
`variantsJson` batch alongside the product fields and creates the product and every row
inside one `db.$transaction`, so a bad row can't leave a half-built catalogue. The
existing one-variant-at-a-time pages are untouched — this is additive, for initial bulk
entry, not a replacement.

**Bulk image rows were deliberately left out of this pass.** `ProductImage.publicId` is
required and is meant to hold a real Cloudinary asset id; there is still no admin path
that creates a `ProductImage` row at all, and image upload stays blocked on real Cloudinary
credentials per Phase 1's "Not done, deliberately" list. A pasted-URL row with a fabricated
`publicId` would be the same category of guess this project already refuses to make on
SKUs and prices, so it wasn't added here. Revisit once Cloudinary credentials exist and a
signed upload widget can supply a real `publicId`.

### Merged parallel Phase 5/6 work, applied its migrations · 23 August 2026

`git push` was rejected: origin/main had three commits this session never saw — full
Phase 5 (checkout, Razorpay, order transaction, admin orders/settings) and Phase 6 (GST
invoices, Shiprocket fulfilment, order notifications), built elsewhere. Merged rather than
force-pushed over it. Two real conflicts, both mechanical, not judgement calls:

- `next.config.ts` — both sides added a CSP `connect-src` exception (this session's
  Cloudinary upload fetch, the other session's Razorpay Checkout calls). Combined into one
  directive; kept the other session's new `frame-src` line as-is.
- `DECISIONS.md` — both sides appended new entries at the same point. Reordered by date
  (9 August before 21–22 August) rather than picking one side.

Ran `pnpm install` (lockfile gained `@react-pdf/renderer`), applied the two pending
migrations (`20260808120000_phase5_settings`, `20260810120000_phase6_fulfilment`) against
the live Neon database, then reverified all four gates on the merged result: 289 tests
(up from 191), clean typecheck/lint/build, every Phase 5/6 route present in the build
output. Pushed as a normal merge commit, no force.

### Fixed all 13 code-review findings, compared the result against researched industry practice · 24 August 2026

All 13 findings from the multi-agent review of the merged Phase 5/6 work were fixed, not
just logged — full detail under "Fixed all 13 findings from the Phase 5/6 code review" in
`PROGRESS.md`. Highlights: `transitionOrder` now row-locks the order before reading its
status (closes the webhook-redelivery race that could double-decrement stock and mint a
duplicate GST invoice number); the admin's only working order-status control now actually
notifies customers; the Shiprocket OUT_FOR_DELIVERY message is reachable; phone validation
unified into one correct, shared implementation; both webhook bodies are Zod-validated.

Then researched how the areas this touches are actually done professionally (webhook
idempotency patterns, e-commerce inventory reservation, Next.js serverless background
work, GST invoice numbering, OWASP e-commerce guidance) and checked this codebase against
each:

- **Row-level locking for webhook idempotency is confirmed standard practice** (Stripe/
  Razorpay integration guides converge on `SELECT ... FOR UPDATE` or an equivalent), which
  is exactly what was just added. Added a second, independent layer matching what the same
  research calls out as a common complement: `Order.razorpayPaymentId` is now a unique
  constraint (`20260824055832_unique_razorpay_payment_id`) — nullable-safe (COD/unpaid
  orders never collide), applied to the live database, all gates reverified after.
- **The `reserved`/`quantity` inventory split matches Shopify's own documented
  architecture** (they moved this exact pattern from Redis to Postgres/MySQL at scale) —
  validates the existing design rather than changing it.
- **`after()` for webhook background work matches Next.js's own documented pattern** for
  this exact scenario (acknowledge the webhook immediately, do notification work without
  blocking the response) — validates the fix already made above.
- **GST invoice numbering requirements (gapless, unique per financial year, ≤16 chars,
  new series each 1 April) are already correctly implemented** — no change needed, this
  confirms rather than finds a gap.
- **Two real gaps surfaced that were not in the original 13**, both flagged rather than
  built, because both need an infrastructure decision (which cron mechanism, which
  rate-limit store) that shouldn't be picked silently:
  1. No sweeper releases a stale `PENDING_PAYMENT` order's inventory hold. The reservation
     pattern this codebase already uses is exactly the industry-standard one *except* for
     the expiry half — Shopify's version explicitly pairs reservations with a periodic
     cleanup job. `PROGRESS.md`'s Phase 5 notes already named the related discount-usage
     side of this gap; the inventory-hold side is the same missing piece.
  2. No rate limiting exists anywhere in the app — not just staff login (already
     self-documented as blocked on "no shared store this deployment has"), but now also
     guest checkout (`submitOrder`) and both webhook routes, which OWASP's current
     e-commerce guidance names as exactly the flows scripted abuse targets. Same
     blocker as the login case: needs a shared store (Upstash Redis or similar).

### Both gaps built, thresholds chosen where no spec names one · 24 August 2026

Client approved building both. Neither number below is spec — no document names one — so
both are logged as judgement calls rather than left implicit:

- **`STALE_ORDER_MINUTES = 60`** — chosen to comfortably exceed how long Razorpay Checkout
  realistically stays open on a customer's screen, so the sweep only ever catches a cart
  genuinely abandoned mid-payment, never one someone is still looking at. Revisit if real
  usage shows checkouts routinely taking longer.
- **Rate-limit thresholds** — staff login 5/5min per email (matches common brute-force
  throttling convention); `submitOrder` 10/10min per IP (generous enough for a household
  or office NAT placing a few real orders, tight enough to blunt scripted order spam);
  webhook routes 60/min (Razorpay) and 120/min (Shiprocket) per IP — both are volume
  floors miles above real delivery rates from either provider, not tuned against any
  documented rate limit of theirs.
- **`Ratelimit.slidingWindow`**, not a fixed or token-bucket window — Upstash's own
  default recommendation, and it avoids the fixed-window edge case where a burst can land
  two full quotas back to back across a window boundary.
- **Chose to key `submitOrder`'s limit by IP, not by account** — every order today is a
  guest order (phone OTP for returning customers is still Phase 5's deferred item), so
  there is no account to key it to yet. Revisit once customer accounts exist; IP alone is
  coarser (a shared office/NAT IP shares one budget) but is the only identity available
  now.

### Hosting is Hostinger, not Vercel · 24 August 2026

Client confirmed the real deployment target is Hostinger (a domain-registrar/hosting
company, not Vercel) — the first time this was named. Nothing in the app is actually
Vercel-locked: this is a standard self-hosted Next.js app (server actions, API routes,
middleware, ISR all work under a plain `next start` process, verified directly — see
PROGRESS.md). **One real consequence**: `vercel.json`'s cron entry only works on Vercel.
Left in the repo — harmless if unused — but the stale-order sweep needs a different
trigger once deployed:

- On a Hostinger **VPS**: a crontab entry running `curl` against
  `/api/cron/expire-stale-orders` with the `CRON_SECRET` bearer token, same as any
  Linux-hosted cron job.
- On Hostinger's **managed Node.js hosting** (no shell/crontab access): an external
  scheduler (cron-job.org or similar, free tier is enough) hitting the same URL.

Which of the two Hostinger products this actually runs on is still open — the exact setup
steps differ enough (PM2 + Nginx for a VPS vs a managed build/deploy pipeline) that this
is deferred until the client picks one, rather than guessed at.

### Full-surface security/correctness review · 28 August 2026

Client asked for every feature, security control, and working piece tested, gaps found
and fixed by research, against how other real stores handle the same problems. Four
parallel background agents each audited a different surface — money/GST/pricing, auth/
session/access, Cloudinary/uploads/Sentry, and admin-catalogue/discounts — cross-checked
against each other and against direct web research before anything was changed. Findings
that two or more agents independently reached the same conclusion on were treated as
higher-confidence; those are called out below.

**Fixed, all four gates (`lint`/`typecheck`/`test`/`build`) green after each:**

- **Combo choice let a customer redeem a cheaper size's package price for a pricier one.**
  MX-3's 72 variants (24 fragrances × 3 sizes) all share one `productId`, so a
  choiceOf-empty slot only checked "same product," not "same or lower price." Fixed in
  `resolveComboUnits` (`src/lib/combo-choice.ts`) — a pick is now refused if it costs more
  than the slot's own variant, even when the admin explicitly listed the pricier id in
  `choiceOf`, and refused outright when either side has no published price to compare.
  This also corrects this file's own earlier claim that "a forged choice buys nothing
  cheaper" — it could.
- **Zero/null-priced combo components used to silently vanish from the order** rather than
  being charged the ₹0 they're worth — `cart-pricing.ts` was `.filter()`ing them out of the
  line instead of keeping a real `OrderItem` at `unitPricePaise: 0`. A component with no
  HSN now makes the whole combo line `unavailable` instead of silently dropping a
  component while still charging for the package.
- **Session role/active-status could go stale for the life of a JWT** (confirmed by 3 of
  4 agents independently) — `currentUser()` trusted the token's `role`/`isActive` claims
  rather than the database, so a deactivated staff account or a demoted admin kept its old
  access until the token expired. `currentUser()` (`src/lib/session.ts`) now re-reads both
  fields from `db.user` on every call — the single choke point every `require*Access()`
  guard already goes through, so this fixes all of them at once.
- **Rate limiting could be bypassed by spoofing `x-forwarded-for`'s leftmost hop**
  (`src/lib/client-ip.ts` used to trust the first XFF entry, which a client controls;
  proxies append to the right). Now checks `x-real-ip` first, then the rightmost XFF hop.
  Added an explicit exploit-simulation test proving a forged leftmost entry no longer
  moves the resolved IP.
- **`unlockOrder` (order lookup by phone) had no rate limit** (confirmed by 2 of 4 agents)
  — a phone number is much lower-entropy than the capability token this system otherwise
  relies on, so it was crackable by brute force. Added the same `checkRateLimit` pattern
  already used elsewhere in the codebase, 5 attempts / 10 minutes per phone.
- **Cloudinary uploads only enforced folder scoping, not format or size** — signed
  `allowed_formats` and `max_file_size` were accepted by the signing endpoint but never
  actually signed, so a client could substitute its own values. Verified directly against
  the real account (`resource_type` genuinely must not be signed, confirmed by testing;
  `allowed_formats` genuinely is enforced once signed, confirmed by a live rejected
  upload). Also closed a "destroy any asset in the whole Cloudinary account" gap — deletes
  now refuse anything outside the product's own folder prefix.
- **Server Action errors were losing their message in production** — Next.js redacts a
  thrown Server Action error's `.message` to an opaque digest in production builds, which
  was silently swallowing the publish-guard reasons on `/admin/products` and
  `/admin/combos`. Switched both to `redirect()` with an encoded query-param reason
  instead of throwing, and added a generic `admin/(panel)/error.tsx` boundary for
  anything that still throws unexpectedly.
- **Sentry could capture the order-access capability token** — the browser SDK records
  `window.location.href` on both events and transactions, which is exactly where the
  `?t=…` token on order-tracking/invoice pages lives, and `beforeSendTransaction` wasn't
  scrubbing it in any of the three Sentry configs (only `beforeSend` was). Added a shared
  `scrubCapabilityToken` and wired it into `beforeSendTransaction` in all three.
- **Discount usage limits had a read-then-write race** — `loadDiscountCandidates` reads
  `usageCount` outside any lock, so concurrent checkouts near a limit could all pass the
  same check and all succeed. The increment inside `placeOrder` is now a single
  conditional `UPDATE ... WHERE usageCount < usageLimit`; if fewer rows update than
  discounts applied, the whole order rolls back with a new `DiscountExhaustedError`
  rather than overselling the offer.
- **`quoteOrder` never checked per-customer discount usage at all**, only `placeOrder`
  did — a signed-in customer near their `perCustomerLimit` could see one (wrong,
  discounted) total at the quote stage and be charged a different one at checkout.
  `customerDiscountUsage` now runs in both, using the same signature already established
  for `resolveSellerEntity`.
- **`MAX_PAISE` was never enforced at the order-total level** — only individual line
  unit prices were asserted. Added `assertPaise` on both `subtotalPaise` and `totalPaise`
  at the end of `calculateCart` (`src/lib/pricing.ts`), so a cart engineered to sum past
  ₹1 crore now fails loudly instead of silently placing an order Razorpay would likely
  reject anyway, or worse, one it wouldn't.
- **Order number and invoice number sequences could straddle a financial-year boundary
  independently** — both `nextOrderNumber` and `assignInvoiceNumber` defaulted `now = new
  Date()` on their own, so an order placed in the last instant of 31 March could file
  under one FY's order sequence and the other FY's invoice sequence if the two calls
  landed a moment apart. `placeOrder` now computes one `now` and threads it through both.
- **A fixed (non-choice) combo slot's own variant was never checked for `isActive`** —
  the choice-slot path and the VARIANT cart-line path both already refused a deactivated
  variant or product; the fixed-slot fallback did not, so a combo could keep shipping a
  fragrance pulled from sale as long as no customer touched its choice slots. Same guard
  added to that branch in `resolveComboUnits`.
- **Discount priority tiebreaking was nondeterministic** — `resolveConflicts` breaks a
  tie on identical `priority` and identical value by array order, and the automatic-
  discount query behind it had no `ORDER BY`, so which discount actually won a tie could
  vary between otherwise-identical requests. Added `orderBy: [{ priority: 'desc' }, { id:
  'asc' }]` to that query.
- **`previewDiscountAction`'s two arguments were entirely unvalidated at runtime** — the
  only admin action missing the project's own "every input is Zod-validated at the
  boundary" rule (per `CLAUDE.md`). Added `sampleLinesSchema`/`previewSettingsSchema`.
  Also added a date-validity `.refine()` on discount `startsAt`/`endsAt` so a malformed
  date string fails with a field message instead of an opaque 500 from an unchecked `new
  Date()`.
- **Pincode prefix `34` was unmapped** — verified via research to belong wholly to
  Rajasthan and added to `DEFINITE`. Deliberately did *not* add `35` (research was
  inconclusive) or the Army Postal Service `9xxxxx` range (confirmed to be a functional
  zone with no fixed state — mapping it to any one state would be actively wrong, not
  just incomplete).

**Researched and confirmed already correct, no change:**

- Cloudinary `resource_type` must not be signed (determined by the upload URL path, not a
  signable parameter) — confirmed against Cloudinary's own docs before touching the
  signing code, so the fix above adds real enforcement without breaking uploads.
- The `reserved`/`quantity` inventory-hold split, row-level webhook idempotency locking,
  and the GST invoice-numbering rules were all re-checked against industry practice in
  the prior review round (see above) and nothing here contradicted that.

**Flagged rather than fixed — business/product decisions, not bugs:**

- **Delivery and COD-handling fees are not taxed under GST in this codebase.** Whether
  that's correct depends on how BBTC's invoices are meant to characterise those charges
  (a disbursement vs. a taxable service) — a compliance question for whoever files the
  GST returns, not a code defect to guess at.
- **An unmapped ("unknown") pincode currently lets the customer's own state selection
  stand.** One audit agent recommended making "unknown" a hard error instead. That is a
  real checkout-friction-vs-compliance-risk tradeoff, and `pincode.ts`'s own documented
  design intent ("an unknown state costs the customer one dropdown") already chose the
  permissive side deliberately — changing it is a product decision, not a bug fix.
- **No recovery path exists if the sole ADMIN account gets locked out by the per-email
  login rate limit.** Worth having a break-glass plan (a second admin account, or a documented
  manual unlock) before this ever goes live with only one admin.

## Mobile navigation and admin table overflow · 6 September 2026

- **The storefront had no mobile navigation at all.** Brands, Shop, Our story and
  Stockists lived in a single `hidden md:flex` row, so below 768px a phone could reach
  the logo and the cart and nothing else — the footer link list was the only way to move
  around the site on the device most customers use. `Nav.tsx` now has a disclosure panel
  below `md` carrying the primary links and all eight brands.
- The toggle is a **text label** ("Menu" / "Close"), not a hamburger glyph: this project
  has no icon set and CLAUDE.md rules out emoji. It matches `CartDrawer`'s "Close".
- The panel reuses `CartDrawer`'s scroll-lock idiom — save `document.body.style.overflow`,
  set `hidden`, restore the saved value — so two overlays closing in either order cannot
  strand the page unscrollable.
- The panel closes on Escape, on any link, and on crossing the `md` breakpoint. That last
  one matters on a phone: rotating to landscape can cross 768px and would otherwise leave
  the panel open behind a desktop bar with no visible way to dismiss it.
- The header's hide-on-scroll-down is suppressed while either menu is open, so an open
  panel cannot be carried off screen by a stray scroll.
- **The brand mega-menu was still `lg:grid-cols-7`** — left over from seven brands, so
  MAKAFA wrapped alone onto a second row. Now `sm:grid-cols-2 lg:grid-cols-4`: four
  across, two even rows of eight.
- **Seven admin tables overflowed horizontally on a phone.** Each is now wrapped in
  `overflow-x-auto` with a `min-w-3xl` floor on the table, the pattern the orders table
  already used — the wrapper scrolls rather than the page, and columns are not crushed
  into unreadable slivers. The settings weight-slab table was **deliberately left alone**:
  two input columns inside a `max-w-xl` form already fit, and a `min-w` floor there would
  have created horizontal scrolling where there was none.

**Bug fix, pre-existing and unrelated to the above:**

- A **duplicate stock code in the bulk variant rows reported "That slug is already in
  use."** The P2002 handler read only `error.meta.target`, which a Prisma driver adapter
  never sets — it nests the cause under `meta.driverAdapterError.cause.constraint.fields`.
  The check had therefore never matched in this configuration. Now read through
  `unique-conflict.ts`, unit-tested against the real error shape this project produces and
  verified end to end through the full product form. The single-variant form needed no
  change: `sku` is the only unique column on `ProductVariant`, so its blanket message was
  already correct.

## Missing-page and error handling on the storefront · 6 September 2026

The storefront had no `not-found`, `error` or `loading` boundary of any kind — only the
admin panel did. Three things followed from that, all confirmed against a real
`next build` + `next start`, not just `next dev`:

- **A missing product, brand, category or combo rendered a completely blank page.** Status
  404, body empty: no message, no header, no footer, no way back. For a store replacing a
  live WooCommerce site, whose old links will be followed for years, this was the worst
  failure mode on the site.
- An unmatched URL got Next's built-in black-on-white "404: This page could not be found".
- A failed render fell through to Next's default error screen.

**`notFound()` does not render a not-found boundary in this app's production build.** This
was worth pinning down rather than guessing, because the obvious fix does not work. A
boundary was tried at the route-group level (`(storefront)/not-found.tsx`) and again at the
exact segment level (`products/[slug]/not-found.tsx`); both render correctly under
`next dev` and both are ignored under `next start`, which returns 404 with an empty body.
Ruled out along the way: the async storefront layout, ISR (`revalidate = 60`), and the
Suspense boundary introduced by `loading.tsx` — the blank page reproduces with all three
removed, and with no boundary files present at all. The likeliest remaining cause is the
`authInterrupts` experimental flag, which cannot simply be turned off: `forbidden()` is
what gives the admin role guards a 403 instead of a redirect.

So the pages render the not-found view **directly** instead of calling `notFound()`:

- `components/NotFoundView.tsx` is shared by products, brands, categories and combos, each
  with its own wording. The order lookup uses its own `Shell`, matching the states already
  around it.
- The cost is an HTTP 200 where 404 would be correct. That is bought back with
  `robots: { index: false, follow: true }` in each page's `generateMetadata`, so the page
  cannot be indexed as a soft 404 while remaining a real, navigable page for a customer.
  A blank page at the right status is worse for a customer than a good page at the wrong
  one; `follow: true` keeps the crawler moving through the links on it.
- `app/not-found.tsx` is kept and **does** work — an unmatched URL never enters the
  storefront route group, so it is served by the root boundary at a correct 404. It is
  deliberately synchronous and database-free: whatever is broken enough to land someone
  there must not be able to make that page fail too.
- The route-group `not-found.tsx` was deleted rather than left in place. Something that
  renders only in development is worse than nothing — the next person would trust it.

Also added:

- `(storefront)/error.tsx`, mirroring the admin boundary: a branded recovery screen with a
  working "Try again", and the digest surfaced because Next redacts the real message in
  production and the digest is the only thing tying a customer's report to the server log.
- `(storefront)/loading.tsx`, a skeleton shaped like `ProductGrid` — same gap, same
  breakpoints, same square card — so content does not jump when it arrives. The pulse
  needs no reduced-motion guard of its own; the global rule in `globals.css` flattens it.
- **Search was reachable only from the footer.** It is now in the header alongside Shop,
  Our story and Stockists, and in the mobile panel.

**A note on verifying this work:** several intermediate readings during this session were
wrong because `pkill -f "next start"` does not kill the Node process on Windows, so tests
ran against a stale server still holding port 3000. Kill it by port
(`Get-NetTCPConnection -LocalPort 3000`) before trusting any production check.

## Text alignment and typographic consistency · 6 September 2026

- **The record line mixed two display sizes inline.** `24 fragrance variants of one
  dishwashing liquid.` was a single `type-display-lg` paragraph with the headline in a
  nested `type-display-sm` span. The word space between them was therefore set at the
  larger size and grew with the viewport, and the two utilities carry different
  line-heights (1.05 against 1.15), so the number and the headline sat on a ragged
  baseline once either wrapped. Now a `flex flex-wrap items-baseline` row with an explicit
  `gap-x-4`, which pins the baseline and fixes the gap.
- **`type-caption` was the only utility in the scale with no `line-height`**, so every
  caption inherited whatever its parent happened to set — captions in different containers
  did not share a vertical rhythm, and a caption that wrapped took its leading from the
  parent. Now `1.4`, matching the body rhythm.
- **Nothing but one component guarded against long-word overflow.** Catalogue text is
  typed by an admin, not a typesetter: a long SKU, a run-on product name, a customer's
  email on an order page. One unbroken string pushed its container past the viewport and
  made the whole column below it read as misaligned, worst on a phone. `overflow-wrap:
  break-word` now sits on `body`, with `hyphens: auto` on h1–h3, where a clamp() size makes
  an unbroken word most damaging and a mid-word break most visible.
- **The hero's `after` field had no leading space.** It is empty by default, so nothing
  showed today, but any value set through the admin content editor would have butted
  straight against the italic emphasis. The space is conditional, so an empty `after`
  cannot leave a trailing space in the heading.
- Corrected the last five "seven" references (HouseSpectrum ×3, the brand page, ProductCard)
  left from before MAKAFA became the eighth brand.

**Why the site reads as static, which is not a design problem:** three of the homepage's
nine sections render nothing, because each correctly refuses to show an empty frame —
"How it's made" needs real photography (`home_steps` ships copy with `img: ''` by design),
"Best sellers" needs published products, and "Combos" needs combos. The database currently
has **0 published products, 0 combos and 0 images**; the one MX-3 product is an unpublished
draft. No amount of additional motion changes that: the page is doing what §12 asks, and
the gap is content, not craft.

The 24 real fragrance names *are* in the database, on that draft product's 72 variants, and
would make a genuine centrepiece for the record section. Surfacing them would mean reading
from an unpublished product, which is exactly what the publish guard exists to prevent —
so it is a product decision, not a change to make unilaterally.

### Product image upload — the post-upload gap · 28 August 2026

Client asked for a research pass on "everything," specifically calling out what happens
after an upload. The upload path itself (`images/actions.ts`) had already been through
the security review above — signed, folder-scoped, race-safe `sortOrder` assignment — but
what an admin could actually *do* on that screen once photos existed stopped at "delete."
Compared against how Shopify's and WooCommerce's media panels handle the same screen:

- **No way to change which photo leads, short of delete-and-re-upload in the right
  order.** `product.images[0]` (by `sortOrder`) is what the storefront shows on cards and
  search results (`(storefront)/products/[slug]/page.tsx`), but nothing in the admin ever
  showed that, or let it be changed. Added `moveProductImageAction` — an up/down swap of
  two adjacent `sortOrder` values under the same per-product advisory lock the upload path
  already uses, so two admins reordering at once still serialise correctly — and a "Cover
  image" badge on whichever photo currently leads.
  - **Not drag-and-drop.** Shopify's own panel is drag-to-reorder, but that needs a
    pointer-events library this stack doesn't have, and CLAUDE.md's working agreement is
    explicit: "ask before adding a dependency outside the locked stack," and "when
    ambiguous, pick what keeps the admin simpler — the users are not technical." Two
    buttons per photo cross that bar without a new dependency; revisit if a catalogue with
    many photos per product makes one-step-at-a-time reordering genuinely tedious.
- **Delete had no confirmation step**, for an action that is not reversible —
  `deleteProductImageAction` calls `safeDestroy`, which actually removes the asset from
  Cloudinary. Wrapped it in `window.confirm()` rather than building a custom dialog
  component, for the same "keep the admin simple" reason as above.
- **No feedback during the upload itself beyond a static "Uploading…" label** — for a
  file that can legitimately be up to 20MB (`MAX_UPLOAD_BYTES`) on what may often be a
  slower connection, that's silence for however long the POST takes. Switched the
  Cloudinary POST from `fetch` (no progress API at all) to `XMLHttpRequest`, the only way
  to get real `upload.onprogress` events in a browser, and added a percentage to the
  button label plus a progress bar.
- **No preview of the chosen file before uploading**, so a wrong file wasn't caught until
  after the round trip. Added a local preview via `FileReader.readAsDataURL` — deliberately
  not `URL.createObjectURL`, which produces a `blob:` URL the CSP's `img-src` (`self`,
  `data:`, `res.cloudinary.com`) would silently block; the existing dimension-check code
  in this same file already worked around the identical constraint via
  `createImageBitmap` instead.
- **A successful upload gave no confirmation beyond the grid silently updating** — nothing
  for a screen-reader user, and nothing for a sighted one who wasn't watching the grid.
  Added a `role="status"` success message naming the alt text that was just saved.
- **Deliberately did not build multi-file (batch) upload.** WooCommerce and Shopify both
  support it, but every image here needs its own real, specific alt text (the master
  brief's photography checklist plus WCAG's own requirement) — a batch flow either forces
  one shared alt text across every file in the batch, which is wrong on its face, or needs
  a per-file alt-text queue UI, which is a real scope increase for a one-photographer-at-a-
  time catalogue workflow. Flagged rather than built; revisit if the MX-3 Semi-Gel rollout
  or a future brand's onboarding makes uploading many photos per sitting a routine event
  rather than an occasional one.

All four gates re-verified after: `pnpm typecheck`, `pnpm lint`, `pnpm test` (302, unchanged
— no new pure logic to unit-test here, this is UI/interaction), `pnpm build`.

### Live end-to-end admin walkthrough — three real, severe bugs found and fixed · 7 September 2026

Client asked for every admin feature to actually be exercised and made to work, not just
reviewed. Ran the built app under `next start` against the real database, drove it with a
real headless Chromium through every catalogue/discount/combo create flow, image upload,
reorder and delete, and both publish-toggle paths, using disposable `ZZTEST`-prefixed rows
cleaned up (hard-deleted, not just deactivated) at the end of each pass. Three real,
severe, previously-shipped bugs surfaced this way that no unit test could have caught,
because all three are about the browser/FormData/DOM boundary the unit suite doesn't
exercise:

1. **Creating or editing any non-food product was completely broken**, and so was creating
   any discount of any type. Root cause, identical in both files: several form fields only
   exist in the DOM inside a conditional block (`{isFoodProduct && (...)}` in
   `product-form.tsx`; a `{type === '…' && (...)}` block per discount type in
   `discount-form.tsx`), so whenever that block isn't rendered, `formData.get(fieldName)`
   returns `null` — not `undefined`. Every one of those fields was typed
   `.optional().or(z.literal(''))`, and Zod's `.optional()` only ever accepts `undefined`;
   `null` satisfies neither branch of the union, so the whole submission failed Zod
   validation. Since the overwhelming majority of products aren't food products, and every
   discount type only renders four of its five value fields, this meant **the two most
   basic catalogue-admin actions — create/edit a product, create/edit a discount — failed
   on essentially every real submission**, silently, with a generic "Check the highlighted
   fields" banner naming no actual field (the broken fields aren't in either action's
   field-error allow-list). Fixed by adding `.nullable()` to the seven affected fields in
   `products/actions.ts` and the five in `discounts/actions.ts` — logged in code comments
   at each site so the reasoning doesn't need rediscovering. Worth a wider note: any admin
   form field that only exists in the DOM conditionally is a candidate for this exact bug;
   the fix pattern is `.nullable()` (or normalise `formData.get(x) ?? ''` before parsing),
   not `.optional()` alone.
2. **The Cloudinary `max_file_size` signing added in the review round above was actively
   breaking every single image upload with "Invalid Signature."** That round's DECISIONS.md
   entry claimed both `allowed_formats` and `max_file_size` were "verified directly against
   the real account" — true for the first, not actually true for the second. Testing a real
   upload this round surfaced the 401 immediately, and Cloudinary's own error names the
   exact string it expected to verify against — which never included `max_file_size` at
   all. A follow-up direct test against the real account (signing without it, sending it
   unsigned with an absurdly small limit) confirmed the parameter does nothing whatsoever
   for a directly-signed upload like this one — a 19KB file uploaded successfully against a
   1000-byte `max_file_size`. It appears to only mean anything on an *unsigned* upload
   through a dashboard-configured upload preset, which this app doesn't use. Fixed by
   removing it from the signed params and the upload body entirely, and replacing it with
   what the codebase already does for image dimensions one function down: check Cloudinary's
   own reported `bytes` after the file exists, and destroy the asset if it's over
   `MAX_UPLOAD_BYTES`. The client keeps a courtesy pre-check against the same constant.
   Corrected the incorrect claim in this file's own earlier entry and in `cloudinary.ts`'s
   doc comment rather than leaving it to be rediscovered as a mystery regression.
3. **Confirming an image delete through the browser's native dialog silently failed to
   update the screen**, even though the delete itself succeeded — the row would still show
   the deleted image until a manual reload. Root cause: `window.confirm()` blocks the JS
   thread for as long as the native dialog is open; starting a `useTransition`-wrapped
   server-action call immediately after it returns, still inside the same click handler,
   drops the refresh — confirmed directly by patching `window.confirm` to resolve without a
   real blocking dialog, which fixed it every time, and separately by confirming via direct
   database query that the delete really had committed even when the UI didn't reflect it.
   Fixed with a `setTimeout(fn, 0)` around the `startTransition` call in `image-card.tsx`,
   letting the browser finish unwinding the dialog's own event handling before the
   transition starts in a clean task. `moveProductImageAction` (no confirm dialog in its
   path) never had this problem, which is what made the delete-only symptom worth chasing
   down rather than assuming a shared cause.

All three fixes verified by re-running the same live walkthrough clean afterward: every
catalogue create flow, both image-upload passes, reorder, delete, and both publish toggles
confirmed working via a combination of UI assertions and direct database checks. All four
gates green: `pnpm typecheck`, `pnpm lint`, `pnpm test` (302, unchanged), `pnpm build`. No
test-data residue left in the real database — every `ZZTEST`-prefixed row created during
the walkthrough was hard-deleted afterward, not merely deactivated.

---

## Admin panel setup — first real staff account, and the env scaffold

**The first staff account is made by a script, not a screen.** The panel has no user
management, so there was no way to create a real login: you cannot sign in to create the
account you need in order to sign in. `pnpm user:create --email you@example.com --name
"Your Name" [--role ADMIN]` (`scripts/create-staff-user.ts`) is that bootstrap. It upserts
on the address, so re-running it is also the password-reset and role-change path for as
long as no screen exists. A full `/admin/users` CRUD is a real feature and is deliberately
*not* what this is — it is the smallest thing that unblocks having a non-shared login.

**The password is never a command-line argument.** Arguments land in shell history and are
visible to anything that can list processes. It is read from a hidden prompt, or from
`STAFF_PASSWORD` for a non-interactive run. Minimum 12 characters, and the seeded
`ChangeMe!Dev1` is rejected outright so the dev credential cannot be promoted by accident.

**The audit row stores the user row without the hash.** `recordAudit` could not be reused —
it is `server-only` and this runs under `tsx` — so the script writes the same shape
directly. `before`/`after` are the row minus `passwordHash`: an audit trail should not
become a second place a credential is stored. Verified: both rows written, neither
contains the hash.

**`.env` scaffolded with every remaining key, all empty except `CRON_SECRET`.** Both
integration guards (`isRazorpayConfigured`, `isCloudinaryConfigured`) test truthiness, so
an empty string reads as unconfigured and each integration keeps failing closed — the
scaffold cannot make anything half-work. `CRON_SECRET` was generated locally because it is
a shared secret rather than a business decision; the stale-order endpoint went from 400
"not configured" to 401 without a token and 200 with one. Every other value is BBTC's to
supply.

**The catalogue could not be published.** `setProductActiveAction`'s guard refuses MX-3:
it has 72 variants but no HSN code, no GST rate and no images. All three are BBTC's to
answer — the HSN and rate are a tax decision this codebase must not guess, and "no
placeholder images" rules out inventing the third. Left unpublished rather than forced.

---

## Phase 7 — Content admin and retailer locator · 14 September 2026

### Content

- Content shapes and defaults moved to **`src/lib/content-schema.ts`** (pure), so the admin editor, the storefront reader and the tests share one definition. `content.ts` stays the server-only reader.
- Content is **MANAGER-editable**, guarded by `requireCatalogueAccess` — §6 lists content with the MANAGER capabilities.
- Lists are edited **as plain text** — one announcement per line, paragraphs separated by a blank line — rather than add/remove row widgets. Trust badges get six fixed row slots. Simplest thing a non-technical editor can manage.
- **`home_steps` has no editor.** It is photography-led and needs an image upload, not a URL box; it keeps its coded default and stays hidden on the homepage until that exists.
- **The hero button link accepts only an on-site path or an `https://` address.** It lands in an `href` on every visitor's homepage, so `javascript:`, `//host` and `/\host` are refused. The rule is in the shared schema, so a stored row carrying such a link now falls back to the default rather than rendering.
- **Policies (shipping, returns, privacy, terms) have no default text.** An unpublished policy has no page, no footer link and no sitemap entry. They are BBTC's legal statements; the codebase does not invent them. §14 Q17/Q18 are still open.
- Policy text syntax is **blank-line paragraphs plus `#` headings**, nothing more — enough for a legal page, explainable in one hint, no Markdown dependency.
- "Go back to the original wording" and "Unpublish" **deactivate the row, not delete it.** The edited version stays in the audit log; a policy draft stays in the editor to publish again.
- A failed save **echoes the submitted fields back** — React 19 resets a form after its action runs, which would otherwise wipe everything typed on a single validation error. Retailer form does the same.
- Trust-badge rows: **trailing empty rows are dropped, interior empty rows are kept**, so a validation error names the same row number the editor sees on screen.
- "Featured" stays the existing checkbox on each product and combo. The content page lists what is featured and links to it, rather than becoming a second place to set the same flag.

### Retailers

- **A retailer is identified by name (case- and space-insensitive) plus pincode.** A distributor sheet has no natural id, and re-importing it must update rather than duplicate. The manual form refuses a duplicate; import updates it.
- **CSV import is all or nothing.** One bad row and nothing imports; up to 25 problems are listed by spreadsheet row number. A partial import would leave the editor fixing a sheet whose first half is already live.
- **Shops missing from a sheet are left untouched** — an import never hides or deletes. One district's file must not wipe every other district.
- **A hidden shop that appears on a sheet is reactivated**: listing it is the statement that it stocks Bright Blue. A shop listed twice in one file: the lowest row wins, reported in the summary.
- **Hand-written RFC 4180 parser, no dependency.** Handles quotes, doubled quotes, embedded newlines, CRLF and Excel's byte-order mark. `.csv` only; an `.xlsx` is refused with instructions to save as CSV.
- **2,000 rows / 512 KB per file**, under Next's default 1 MB server-action body limit. The import transaction timeout is raised to 60 s; only changed rows are written, so re-importing the same sheet is zero writes.
- **District names normalised** to one spelling per Kerala district, including old English names still on distributor sheets (Trichur, Calicut, Alleppey…). A district outside Kerala is kept, title-cased.
- **Storefront pincode search: exact pincode first, then the same three-digit postal area**, and nothing beyond it — a shop in another postal area tells a customer nothing useful. A pincode takes precedence over a district; an unknown district is ignored.
- Search is a **GET form** and the districts are **plain links**, so the locator works without JavaScript and from the keyboard.
- `/stockists` is now **dynamic** (it reads `searchParams`), so its `revalidate = 60` no longer caches it. Stockist reads moved from `storefront.ts` to `src/lib/stockists.ts`.

---

## Soft 404s across the storefront · 17 September 2026

- **A loading boundary commits the HTTP status.** `loading.tsx` starts streaming before the
  page body runs, so a later `notFound()` cannot change a 200 that has already been sent.
  The skeleton therefore lives only in segments that can never 404 — `/shop`, `/search`,
  `/stockists`, `/story` — each a one-line `loading.tsx` re-exporting
  `src/components/PageSkeleton.tsx`. The homepage and the product, brand, category, combo and
  policy pages give up the skeleton to get a real 404. A correct status for crawlers beats a
  skeleton on those routes; §12 Phase 8 has a 301 map riding on 404s meaning what they say.
- **Tailored 404 wording lives in a per-segment `not-found.tsx`, not in the page.** Returning
  `<NotFoundView>` from the page was a 200 with 404-shaped content on it. `notFound()` plus a
  sibling `not-found.tsx` keeps "We couldn't find that pack" *and* the status. `NotFoundView`
  is still the shared body, so the copy did not change.
- **`/policies/*` now 404s until BBTC publishes the text.** That page was already doing the
  right thing — it just said 200 while doing it.
- **`fonts.ts` was left alone.** The eight `Request timed out after 3000ms / Retrying 1/3`
  lines on a cold `next dev` are next/font fetching Instrument Serif and JetBrains Mono from
  Google, retrying, and succeeding: 13 woff2 files land in `.next/static/media` and all four
  font variables reach `<html>`. Not a fault, and not worth self-hosting two more faces over.

---

## Phase 0 — housekeeping and the QA baseline · 17 September 2026

- **The two project skills were undiscoverable and are now where Claude Code reads them.**
  Both copies were mis-nested — `.claude/skills/.claude/skills/<name>/SKILL.md` (two levels
  too deep) and `.claude/bbtc-claude-code-kit/.claude/skills/<name>/` (outside
  `.claude/skills/`). Moved to `.claude/skills/<name>/SKILL.md`. The extracted kit folder
  and its zip are the same two files a second and third time, so they are **ignored rather
  than deleted** — they are BBTC's original download, not ours to throw away.
- **`devIndicators: false`.** The dev badge sits bottom-left and covers page content in the
  QA screenshots, which are taken against `next dev`. No effect on a production build.
- **Playwright is a dev dependency, not a runtime one.** Required by the screenshot matrix
  and the Phase 8 end-to-end flows. Nothing ships with it.
- **`qa/screenshots/` is generated, not source.** Six widths across every route is ~40 PNGs
  per pass and they are regenerable with `pnpm qa:shoot`. Ignored, so the repo does not
  carry image churn in every UI commit.
- **The screenshot script scrolls each page before it shoots.** Nearly every storefront
  section renders at `opacity: 0` until `whileInView` fires, so a naive full-page shot
  photographs an invisible page. It walks the page in viewport steps and returns to the top.
  This is a workaround for the reveal defect, not a fix — the fix is in Phase 2.
- **A route with nothing published is skipped, not photographed.** The only product is
  inactive and there are no combos, so `/products/*` and `/combos/*` would shoot a 404 and
  teach nothing about layout. The script reports what it skipped and why.
- **The 360px overflow check reports element width, which is the wrong question.** Its
  first run flagged `ul.flex.w-max.gap-12` at 2235px on all seven routes. That is the
  announcement marquee (`Ticker.tsx:29`), which is deliberately double-width so it can
  translate by exactly -50% and loop seamlessly — and its parent at line 18 is
  `overflow-hidden`, so nothing scrolls. An element wider than the viewport is not the
  same fault as a document that scrolls sideways. Phase 1 replaces the check with
  `documentElement.scrollWidth > clientWidth`, then attributes the offender only when the
  document really does overflow. Logged rather than quietly corrected because the first
  baseline report carries the false positive.

---

## The guided "Add a product" screen, restored to main · 18 September 2026

- **The screen existed and was not on `main`.** `quick-add/guided.ts` and its tests were on
  `main`, imported by nothing; the two files that make them a screen — `page.tsx` and
  `guided-form.tsx` — were only on `recovery/guided-add-product-2026-09-06`, whose merge
  base is `d953503`. Restored the three missing pieces rather than rewriting them: that
  branch's work was already driven against a real server and carries the fixes for two
  defects (the `metaTitle`/`metaDesc` null submit, and P2002 blaming the slug for a
  duplicate stock code) that would have been reintroduced by starting over.
- **The branch's `actions.ts` was NOT taken.** It predates `main`'s `.nullable()` fix on the
  seven food-label fields, without which every non-food product fails to save. Only the
  `afterCreate` hunk was applied — `createdProductId` plus the redirect to the photo step,
  keyed off the literal `'images'`, never a caller-supplied path.
- **"Add a product" is now the primary action on `/admin/products`**, with the full form
  demoted to a text link, and the empty state points at the guided screen. The full form
  stays exactly as it was for whoever knows what a slug is.
- **Verified against the running dev server and the real database**, as an admin: the
  product saved as a draft, the slug came from the name, 18% stored as `1800`, two
  fragrances sharing one size got distinct stock codes, ₹149.00 stored as `14900`, a blank
  price stored as `NULL` and not `0`, and publishing was refused with
  "Cannot publish: needs at least one variant, one image, an HSN code." Every `ZZTEST` row
  and its audit entries were deleted afterwards.
- **The food half of that run is unverified.** The dev server's stdout pipe died when the
  harness reaped its shell for memory, after which it threw `uncaughtException: write EPIPE`
  and 500'd the photo step; the run stalled on the second product and was stopped. The
  driver is kept at `tmp/verify-quick-add.ts` (ignored) to re-run against a clean server.

---

## The admin shell and the stock screen · 18 September 2026

- **`/admin/inventory` is new, and it is the first way to set stock at all.** The order
  engine in `src/lib/orders.ts` has reserved, committed, released and restocked
  `Inventory` rows since Phase 5, and the Razorpay webhook decrements on payment — but
  nothing ever created a row. 11 locations were seeded and the table was empty, so every
  checkout allocated against nothing. The screen is the missing input, not new machinery.
- **`quantity` is the admin's, `reserved` is the engine's.** The per-location editor shows
  `reserved` read-only. A manager who could type into it could oversell, and the number
  would be stale a second later anyway.
- **A location holding zero is "does not carry it", not "low".** The editor lists all 11
  active locations and tells the user to leave the ones that do not stock an item at zero.
  The first rule — `available <= lowStockAt` — then flagged a variant with 50 bottles at
  the packing centre as "Low at" ten offices that were never meant to hold any. Caught by
  driving the real screen, not by the unit tests, which had only ever been given rows that
  carry stock. `carriesStock` now excludes empty locations from the low check, and a
  variant empty *everywhere* is reported as "Out of stock" — a different sentence needing a
  different action. The cost is that a single branch genuinely selling out is no longer
  named on its own; the variant-level "out of stock" covers it, and it is the more useful
  message.
- **Blank is refused rather than read as zero**, matching the null-price rule: "I left it
  empty" and "there are none" are different statements. The field says so — "Enter 0 if
  there are none."
- **A save that changes nothing writes nothing**, so re-submitting a stocktake leaves no
  audit noise. Validation for every location happens before the first write, so a typo in
  the ninth does not leave the first eight saved.
- **The panel has a sidebar now** (`nav.ts`, `sidebar.tsx`) — a rail from 1024px, a drawer
  below, built from one role-filtered list so a section cannot appear in one and not the
  other. Hiding a link is not access control: every page still calls its own guard, and
  STAFF hitting `/admin/inventory` directly gets a 403.
- **The dashboard shows counts instead of a list of links** — orders to pack, unpaid
  checkouts, live products, needs restocking, never counted. Each tile is a question with
  a link to where it is answered.
- **Verified by driving the real screens as admin and as staff: 42 checks, all passing** —
  stock created and audited, `reserved` untouched, a non-number refused writing nothing, an
  unchanged save writing no second audit row, the attention filter, the 403, the drawer,
  and no sideways scroll at 390px. Every row created was deleted afterwards.
- **Photos remain blocked on credentials, not code.** `.env` still carries the empty
  `CLOUDINARY_*` placeholders from `.env.example`, so `isCloudinaryConfigured()` is false
  and upload is disabled by design. The signed-upload path is built and the page degrades
  with a clear message rather than failing. BBTC has to supply the account.

---

## Reports · 18 September 2026

- **A sale is `CONFIRMED`, `PACKED`, `SHIPPED` or `DELIVERED`.** `PENDING_PAYMENT` is money
  that never arrived; `CANCELLED`, `RETURNED` and `REFUNDED` are money that arrived and went
  back. Counting either overstates revenue, which is the one direction a report must never
  be wrong in. The same list filters the best-seller query, so the two can never disagree.
- **Every figure comes from the order snapshots, never the live catalogue.** Best sellers
  group on `skuSnapshot`, not `variantId` — `variantId` is nullable (a combo line carries a
  `comboId`) and a variant deleted since the sale leaves it dangling. This is the snapshot
  rule doing its job: last quarter's numbers do not move because someone renamed a product.
- **Money stays in paise the whole way through.** Nothing divides by 100; `formatINR` is the
  only thing that renders. The average order is `Math.round`ed to whole paise, because a
  fractional paisa does not exist.
- **Shares are basis points**, per the repo convention, rendered as one decimal place.
- **An unreadable address is bucketed as "Unknown", not dropped**, so the state rows always
  add up to the order count. `shippingAddress` is `Json`: an order written by an older
  checkout or repaired by hand can be any shape.
- **An automatic offer is labelled by its type, not "no code".** `code` is null for
  non-coupon discounts, and "No code — ₹40,000" is not a useful line in a report.
- **`requirePricingAccess`, not catalogue access.** Every figure is money and STAFF are kept
  away from pricing; the sidebar link follows the same rule, and a STAFF member visiting the
  URL directly gets a 403.
- **Verified against seeded orders: 21 checks, all passing** — three countable orders and two
  that must not count, with revenue ₹500.00 over 3 orders, the ₹9,999 unpaid and refunded
  orders absent, units summed across orders, the COD share at 66.7%, both states listed, the
  coupon named and totalled, the period in the URL, a junk period falling back to 30 days,
  and the STAFF 403. All five test orders were deleted afterwards.

---

## The storefront rendered blank without JavaScript · 18 September 2026

- **The scroll reveal was hiding content in the server HTML.** `Reveal`/`RevealItem`
  passed Motion `initial="hidden"`, which Motion writes out as an inline
  `opacity: 0; transform: translateY(24px)`. The homepage shipped **31** such elements,
  `/story` 15, `/shop` and `/stockists` 3 each. With JavaScript blocked, broken or merely
  slow to arrive, most of every page was invisible — and an inline style cannot be
  overridden from a stylesheet, so there was no way to rescue those readers.
  DECISIONS.md already recorded this as a defect the screenshot script works around; this
  is the fix, not another workaround.
- **The hidden state moved from Motion into CSS, behind a `.js` class** set by an inline
  script in `<head>` that runs before first paint. No script, no class, nothing hidden.
  `initial={false}` stops Motion writing anything into the server HTML, and it still
  animates to `opacity: 1` inline on scroll, which beats the stylesheet — so the reveal
  looks exactly as designed.
- **Inline and in `<head>` on purpose.** A deferred or external script runs after first
  paint, which would show every section and then hide it: a flash on every page load.
  `script-src` already allows `'unsafe-inline'`.
- **`prefers-reduced-motion` skips the hidden state entirely** rather than merely
  shortening the transition. An element that starts invisible and is never animated back
  is the one failure this must not have.
- **Verified both halves against the running server: 17 checks, all passing.** With
  JavaScript, below-fold sections still start hidden and every one is visible after
  scrolling through — the animation genuinely runs, which is what `initial={false}` was
  most likely to have silently killed. Without JavaScript, `/`, `/shop`, `/story` and
  `/stockists` carry no hidden reveal target and all render readable content.
- **The brand rail's hover detail still needs JavaScript**, and is left that way. Its
  reveal is React state driving the neighbouring-panel accent bleed, which CSS hover
  cannot reproduce. Brand name and segment — the content that matters — render without
  script; only the tagline and count wait for hover. Degrading, not broken.

---

## Reviews, with moderation · 18 September 2026

- **Built from nothing.** The `Review` model has been in the schema since Phase 1 with an
  `isApproved` flag, and not one line of code read or wrote it. Storefront display, the
  submission form, the rating summary and the admin queue are all new.
- **No account needed to leave one.** Requiring sign-in to review a bottle of dishwash
  would mean almost no reviews, and the account area does not exist yet. Moderation is
  therefore the entire safety model: every review is written `isApproved: false` and is
  invisible — absent from the list *and* from the average — until a manager approves it.
  `getApprovedReviews` filters in the query rather than leaving it to the caller, because a
  filter the caller has to remember is one that eventually gets forgotten.
- **The average is `null`, never `0`, with no reviews** — the same reasoning as a null
  price rendering "Price on request". A zero average would claim every customer hated it.
- **`looksLikeSpam` sorts the queue; it never refuses a submission.** A genuine review that
  quotes two links should not be silently binned, and a manager reads every one anyway.
- **Unapproving is not deleting.** A review that turns out to be about the wrong product,
  or that the writer asks to have taken down, stops being public with its text intact.
  Delete exists too, for abuse, and writes the full row to the audit log first.
- **Stars are real radio inputs**, not clickable glyphs, so the control is keyboard-operable
  and announced as a group without any ARIA of its own.
- **Verified end to end: 31 checks, all passing** — a review left by a stranger, stored
  unapproved, invisible on the storefront, listed in the queue, approved, then appearing
  with a 5.0 average and a count; unpublished and gone again; a two-word review refused
  with nothing stored; STAFF given a 403 and no nav link. The catalogue has nothing
  published, so the run temporarily publishes one product and restores it exactly.
- **Two bugs the browser run caught that the unit tests could not.** The product page 500'd
  because the test's stand-in image used a host `next/image` was not configured for — a
  fixture fault, but it proved the page dies on an unconfigured image host rather than
  degrading. And `suppressHydrationWarning` was missing on `<html>`: the inline `js`-class
  script (see the reveal entry above) runs before React hydrates, so the server HTML and
  the live DOM differed by that one class and React reported a mismatch on every page load.

---

## Product photos moved from Cloudinary to Supabase Storage · 19 September 2026

Recorded late: the swap was written and left in the working tree with no entry here, so
DECISIONS.md still said "Neon" in four places while the code had already moved. This is
the record it should have had.

- **Cloudinary is gone; `product-images` in Supabase Storage replaces it.** The catalogue
  never used a single Cloudinary transformation — no `f_auto`, `q_auto`, `w_` or `c_fill`
  anywhere — because every image is the stored URL rendered through `next/image`, which
  does its own AVIF and WebP conversion. The one real reason to keep a media CDN was
  therefore already absent, and this puts the database and the files with one provider.
- **No SDK.** Four calls are needed — sign, publish a URL, stat, delete — and the working
  agreement says to ask before adding a dependency. `@supabase/supabase-js` is ~200KB for
  four `fetch` calls, so it did not earn it.
- **The upload still never passes through this server.** The browser is handed a
  short-lived signed URL and PUTs the file straight to Supabase, exactly as it used to POST
  straight to Cloudinary. The destination path is chosen server-side when the upload is
  signed, never by the caller — that is what stops a signed upload being aimed at another
  object.
- **`image-header.ts` exists because Supabase is a plain object store.** Cloudinary
  returned authoritative `width`/`height` with every upload, which is what let the §9
  "at least 2000px on the long edge" rule be checked against a number the client could not
  forge. Supabase reports size and content type and nothing about pixels, so the server
  fetches the first 64KB of the stored object with a `Range` header and parses the PNG,
  JPEG, WebP and AVIF headers itself. Without it the rule would have to trust whatever the
  browser claimed, which is not a check at all. Dependency-free for the same reason as
  above, and far easier to test than a package.
- **An unreadable header is refused, never waved through.** A renamed PDF, a truncated
  file or an SVG parses as no format the uploader accepts, and that is exactly the case a
  size rule would otherwise be trivially bypassed by. The object is deleted rather than
  left orphaned and unlinked.
- **`ProductImage.publicId` keeps its column name and now holds the storage path.** Same
  role it always had — the handle the object is deleted by — so no migration was needed.
- **The bucket is public-read, and that is deliberate.** `next/image` fetches photos as an
  anonymous client; a private bucket would mean minting a signed URL per image per render.
  The bucket holds nothing but catalogue photography already on the shop front.
- **The bucket's MIME allowlist is the real enforcement, not the app's.**
  `saveProductImageAction` re-checks the type, but by then the object is already stored.
  The bucket refuses a disallowed type outright, which is what keeps a signed upload URL
  from being used to park an executable or a script-carrying SVG.
- **`pnpm storage:setup` provisions it** (`scripts/setup-storage.ts`), because the admin
  panel cannot create its own bucket. It is the storage half of what
  `prisma migrate deploy` is for the database: idempotent, reads the bucket back before
  writing, corrects only what has drifted, and `--check` reports without changing. Its
  limits come from `storage-shared.ts` — the same constants the uploader and the save
  action enforce — so the bucket and the app cannot disagree about what a valid photo is.
- **Dev Postgres stays local.** Only Storage is being taken from Supabase here;
  `DATABASE_URL` still points at the `bbtc-postgres` Docker container. `.env.example`
  documents a Supabase Postgres connection string as the deployment shape, which is a
  separate choice from this one and is not yet made.

### Storage connected and driven end to end · 19 September 2026

- **A missing bucket is an HTTP 400, not a 404.** Storage answers
  `GET /bucket/<id>` for a bucket that does not exist with **400** carrying
  `{"statusCode":"404","code":"NoSuchBucket"}` in the body. `setup-storage.ts` keyed off
  `response.status === 404` on its first run and so turned "not created yet" — the one
  state it exists to fix — into a hard error, unable to ever create anything. It now reads
  the body, and still accepts a real 404 in case that is tidied up later.
- **The bucket's MIME allowlist was confirmed to do real work, not just be recorded.**
  Signing an upload the way the app does and then PUTting `application/pdf` and
  `image/svg+xml` straight at the signed URL — what a hostile or compromised client would
  try — is refused with a 400 by Storage itself, before the app sees it. SVG is the one
  that matters: it is an image, and it can carry script.
- **Verified end to end in a real browser as a manager: 12 checks, all passing.** An 800px
  photo refused client-side by the long-edge rule with the actual size named; a 2400px
  photo signed, PUT straight to Storage, re-read from the stored object and saved; the row
  carrying the storage path in `publicId` and the public URL in `url`; `next/image`
  optimising it with a 200, which is what proves `remotePatterns` picked up the host; and
  the object publicly readable. Then deleted through the admin UI, with the stored object
  confirmed gone from the bucket rather than orphaned, and `create` + `deactivate` both
  audited. Every ZZTEST row, its audit entries and the bucket object were removed
  afterwards; images and image audits are back to zero.
- **`storage-shared.ts` now has tests** (19), because `isOwnedPath` is the single gate that
  `createSignedUpload`, `statObject`, `removeObject` and the save action's Zod schema all
  rely on — one hole there is a hole in four places at once. Traversal at any position, a
  leading slash, and the `products-backup/` near-miss are all covered, as is
  `extensionForMimeType` refusing SVG.
- **The dev server must be restarted after setting `SUPABASE_URL`**, not just reloaded:
  `next.config.ts` computes `images.remotePatterns` from it at config load, so without a
  restart every product photo 500s at the optimiser even though the upload itself works.

### GitHub sign-in, upload hardening, CI (23 September 2026)

- **Staff can sign in with GitHub, as a second door to the same staff accounts.** No schema
  change and no adapter: a GitHub account gets in only if exactly one of its *verified*
  emails matches an active `User` with admin access, and the role comes from that row. It
  never creates a user. Hidden unless `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are set.
- **Verified emails are re-fetched from GitHub**, because Auth.js's provider takes the primary
  address without checking `verified` — matching on it would let anyone claim a staff email.
- **Photo save now requires a path signed for *that* product** (`isUploadPathFor`). Before,
  any `products/...` path passed, so product A could adopt product B's photo, and a save with
  blank alt text naming a live photo deleted it from storage without an audit entry. Rejected
  saves now only clean up objects no `ProductImage` row points at.
- **CI runs lint, typecheck and unit tests** on pushes to main and on every PR. No build, no
  database, no secrets.
- **Shiprocket settings now have an admin form** (pickup location, pickup pincode, live
  rates). Until now they existed only in the schema, so no pickup location could be set and
  every "Push to Shiprocket" would have failed. When Shiprocket is reachable the pickup is
  chosen from the account's real list and its pincode is copied from it, since a mistyped
  pickup name is the usual reason Shiprocket refuses an order.
- **Saving delivery rates no longer blanks the Shiprocket fields.** Both forms write the
  same `shipping_rates` row; each now merges with what is stored.
- **The tracking webhook is also served at `/api/webhooks/courier-tracking`**, because
  Shiprocket's dashboard refuses webhook URLs containing "shiprocket". The old path stays.

### Full end-to-end pass before Shiprocket and Razorpay (23 September 2026)

Driven in a real browser as guest, STAFF, MANAGER and ADMIN: every page, then buy → fulfil →
cancel, catalogue CRUD, discounts, combos, reviews, retailers, policies, settings, phone width.
Five defects found and fixed:

- **No order could be placed.** `pg_advisory_xact_lock` returns `void`, which Prisma 7 cannot
  deserialize through `$queryRaw`; order and invoice numbering both used it. Now `$executeRaw`,
  as the image actions already did.
- **Checkout sent an empty phone on the delivery address,** so the server refused every order
  and bounced the customer to Delivery with no visible reason. The Contact number is now sent,
  and a server error only moves the customer to a section that can display it.
- **The cart drawer stayed open over /checkout,** blocking the form. It now closes on any
  navigation.
- **Admin forms wiped everything typed when a save was refused** (React 19 resets a form after
  its action). `useFormActionKeepingInput` puts the submitted values back; used by every admin
  form with inputs. Discount start date now defaults to "now" when left blank.
- **"Pay online" was offered with no Razorpay keys,** creating an order and holding stock
  before failing. It is now disabled until the keys exist, and the server refuses it before
  writing anything.

### Shiprocket, end to end (24 September 2026)

- **Orders go to Shiprocket automatically on confirmation** — from the Razorpay webhook for
  prepaid, on placement for COD, never from the thank-you page. Inside `after()`, never
  failing the webhook. On by default (a Settings toggle), because creating a Shiprocket order
  costs nothing; only an AWB does. A failed push is stored on `Order.shiprocketError` and shown
  on the order page.
- **One "Ship" button** runs create → AWB → pickup + manifest → label, resuming from the step
  that failed. Reversed the Phase 6 "three buttons" call: the steps are idempotent and cached
  on the order, so one button loses nothing, and the error names the step. A retry after the
  AWB never re-notifies the customer.
- **"Cancel in Shiprocket" forgets the shipment but leaves the order's status alone.** It
  exists for test orders (no sandbox); cancelling the sale itself is a separate decision.
- **The Shiprocket token is cached in the `Setting` table** (`shiprocket_token`), keyed to the
  API email, so Vercel cold starts do not log in again. Postgres rather than Upstash: the token
  is not a rate-limit counter, and the DB is always there.
- **COD is switched off per pincode when no Shiprocket courier collects cash there.** It can
  only remove COD, never grant it past the admin's allowlist.
- **Box size is whole centimetres on variants, optional on combos.** The order's box stacks
  the measured boxes on the widest footprint (`parcel.ts`); anything unmeasured counts as the
  old 20 × 15 × 15 carton, so nothing changes until someone measures. A combo's own packed
  weight is spread across its units, rounded up, because combo lines are stored per component.
- **Box fields are on the single-variant form only**, not the bulk and guided add screens —
  those stay short; boxes are measured once, later.
- **Env names follow `SHIPROCKET_API_*`; the old `SHIPROCKET_*` still work.** Pickup
  location/pincode env vars are a fallback only; the Settings form wins.
- **Field names for pickup, manifest and tracking are from Shiprocket's public API docs and are
  unverified against a live account** — same caveat as the webhook payload.
- **Only `payment.captured` and `order.paid` confirm an order**, not `payment.authorized` —
  authorised money can still be refunded to the customer if never captured. The store expects
  auto-capture.
- **A payment landing on a cancelled order is recorded as paid and flagged, not confirmed.**
  Its stock hold is gone, so staff refund it (or call the customer); silently ignoring it lost
  the fact that money arrived.
- **Razorpay Checkout times out at 15 minutes**, a quarter of the 60-minute stale-order expiry.
- **Closing the payment window keeps the placed order payable.** "Pay" reopens it rather than
  placing a second one; any edit to the form forgets it and the next submit places afresh.
- **Scroll reveals never hide what is on screen at load.** `RevealItem` hides itself only if it
  is below the fold when it hydrates; the first screen paints straight from the HTML. The cost:
  first-screen content no longer fades in on page load. Hiding it until hydration held a
  phone's largest paint back ~2 s (3.1 s → 1.0 s on home under slow-4G emulation).
- **The `.js` class and its inline `<head>` script are gone** — they existed only for the old
  reveal rule.
- **Motion runs with `domAnimation`, not the full engine.** Every component uses `m.*` inside
  `LazyMotion strict`. The cart's `layout` slide was the only thing needing `domMax`; a removed
  line now collapses its own height instead. A lazy `import()` of the features was tried and
  deferred nothing (webpack bundles it through the same `motion/react` barrel), as was
  `optimizePackageImports` (byte-identical output) — both reverted.
- **Lenis only on a fine pointer.** Touch scrolling is native; the rAF loop cost battery for nothing.
- **Razorpay's checkout.js loads only when online payment is on, from the delivery step.** It is
  ~2 MB with what it pulls in; a COD-only checkout downloaded it for nothing.
- **When only one payment method works, checkout selects it.** Online payment off used to leave
  "Pay online" (disabled) selected and the Pay button greyed out until the customer found COD.
- **Brand pills are one swipeable row below 640px.** Wrapped, nine pills took five rows above the
  headline and re-flowed when the brand font arrived.
- **Product and combo pages go two-column from 768px, not 1024px**, and the sticky buy bar is
  phone-only. An iPad portrait showed a full-width photo before any price.
- **`viewport-fit=cover` with safe-area padding** on the body and the fixed bars, so nothing sits
  under a notch or the home indicator.
- **44 × 44 minimum tap targets via one `tap-target` utility**, and every text input at 16px —
  iOS Safari zooms the page into anything smaller.
- **JetBrains Mono is not preloaded.** It is never the largest element; preloading it competed
  with the photo and headline on a slow connection.
- **The admin panel was left out of this pass**, per the owner. It stays desktop-first.

## Storefront interaction polish (25 September 2026)

- **Buttons are two CSS utilities, `btn btn-primary` and `btn btn-secondary`** (§9: no third
  style). They replace about 14 copy-pasted `bg-signal` class strings, none of which had a hover state.
  Hover rises 2px on the lift duration and turns primary ink; press settles back at 98%.
- **Secondary buttons are now ink-outlined, per §9**, not `border-line`.
- **No toast system.** Every add-to-cart already opens the drawer, so a toast would repeat it.
  The feedback is the drawer plus a cart count that pops when it changes.
- **The product page's sticky mobile buy bar still shows all the time.** Making it slide in was
  reconsidered and dropped, per the existing note in `ProductDetail`: a bar that appears
  mid-scroll moves what is under the thumb.
- **Fragrance swatches are still not grouped by family.** No family data exists; grouping it
  would need a schema change, and this pass was UI only.
- **HouseSpectrum is a 2/4-column grid, no longer one flex row of eight.** The 1280px container
  leaves each panel about 106px, narrower than "Kenzaniya" at heading size. It pushed the
  homepage 22px wider than the viewport at every desktop width.
- **Skeletons shimmer instead of pulsing** (`skeleton` utility), and the cart shows skeleton lines
  while it prices instead of a line of text.
- **z-index has named tokens**: `--z-sticky`, `--z-header`, `--z-overlay`, `--z-drawer`.

## Storefront illustrations and brand logos (27 September 2026)

- **Brand logos come from `public/brands/`, via `src/lib/brand-art.ts`.** `Brand.logoUrl` is still unset everywhere; the bundled file wins over it, because a stored URL on a host `next/image` is not configured for would take the page down. Logos were trimmed and capped at 1600px; stray fragments were erased from Rafasi (a leaf) and Yellosmelly, and MX-3's ® was kept.
- **Illustrations are drawn SVG in the site's tokens (ink line, sky and paper fills), never the brand accent.** They are decoration, `aria-hidden`, and never stand in for a product photo. Product imagery is untouched.
- **The hero has 24 bubbles and the record seal 24 scallops**, one per MX-3 fragrance.
- **Brand one-liners from `content.json` show only when a brand has no tagline of its own.** Kenzaniya keeps "Pantry staples you can trust." MAKAFA, absent from that file, gets "Premium perfume and fragrance."
- **Changes from `content.json`:** "Seven" became eight, and "Gentle on hands" became "An ISO 9001:2015 company" (printed on the MX-3 label; the gentleness claim has no evidence). "Combos that save more" shows only while featured combos exist. Otherwise it falls back to "Secure online payment" when Razorpay is configured, else "Straight from the maker".
- **The support band uses `CONTACT`**, the store's own inbox, not `content.json`'s `info@brightblue.in` from the old site.
- **Hero copy, and `content.json`'s "Made in Palakkad" heading, were not applied.** The hero and story are admin-edited content blocks, and the record-led hero is the brief's centrepiece.
- **The newsletter block was not built.** No subscription backend exists, and a form that goes nowhere is worse than none.

## Hosting on Vercel + Supabase, pre-launch backend pass (28 September 2026)

- **Hosting is Vercel Pro for the whole app, Supabase for Postgres and photos.** Cloudflare Workers was rejected: scrypt at N=2^17 needs ~128 MB, the Workers isolate limit, so staff login would fail; and D1 (SQLite) cannot hold the interactive transactions and row locks orders depend on. Vercel Hobby was rejected too: it forbids commercial use and allows only a daily cron.
- **The database moved to a new Supabase project in ap-south-1 (Mumbai), `mjbebzlknjowvwhmzzzd`.** The first project was in ap-southeast-2 (Sydney) and still empty, so moving cost nothing. `vercel.json` pins functions to `bom1` beside it.
- **Postgres TLS is verified against Supabase's own root CA, in `src/lib/pg-config.ts`.** Dashboard connection strings connect unencrypted, and `sslmode=require` fails with SELF_SIGNED_CERT_IN_CHAIN because pg treats it as verify-full against public CAs. The CA is embedded, since it is a public cert, and any sslmode in the URL is stripped because pg lets it override the `ssl` object. Every connection (app, seeds, scripts) goes through the helper.
- **The pool is capped at 5 per instance**, so a burst of Vercel instances cannot exhaust Supavisor.
- **Every table has RLS on and no policies; anon/authenticated privileges are revoked** (migration `lock_down_data_api`). Prisma leaves `public` open to Supabase's REST API, and the anon key read `User`, `Order` and `Address` with 200. The app never uses that API and Prisma connects as the owner, so nothing in the app changed. `rls-migrations.test.ts` fails if a new model ships without RLS.
- **Checkout oversold under concurrency, fixed.** `inventoryFor` read stock without a lock, so 12 simultaneous orders of 2 against 20 units all succeeded and left a row at −4. It now takes `FOR UPDATE` on the variant's inventory rows in id order before reading. `pnpm e2e:stock-race` is the regression check.
- **The seed skips dev users on a Supabase host.** A known password on an ADMIN account is a way in; real staff come from `pnpm user:create`.
- **The e2e scripts accept `E2E_ALLOW_DB_HOST`**, an exact host, to run once against the empty pre-launch database. The default still refuses anything non-local.
- **MX-3 stays a draft on Supabase.** Publishing needs an HSN code, which no document has confirmed yet. The pass set 3402/18% temporarily and reverted it.
- **A product with no GST rate was sold at 0%, fixed.** `cart-pricing` fell back with `gstRate ?? 0`, and the publish guard checked HSN but not the rate, so a detergent published before its rate was entered went out untaxed with a matching invoice. Null now makes the line unavailable, as a missing HSN already did, and publishing requires a rate. Nil-rated goods save an explicit 0, which still sells.

## Hosted database readiness audit (6 October 2026)

- **The Sydney Supabase project is gone, and local `.env` storage now points at Mumbai.** `jputwvnpsmmmagifpqik` answers 410, so local uploads had been failing and two local image rows were dead links. Local database URLs stay on Docker; only `SUPABASE_URL` and the service key moved, which means an upload or delete from local admin acts on the production bucket.
- **Hosted holds no test data, so nothing was removed there.** One product (the real MX-3, 72 priced variants), no orders, combos, discounts, retailers, reviews, content or settings. The local test product "dvdf" was deleted; `ZZTEST` rows remain local only.
- **Nothing was copied from local to hosted.** Local delivery slabs, COD rules and the MX-3 HSN are test values. Delivery rates, COD and opening stock are BBTC's to enter in the admin.
- **MX-3 still cannot be published on hosted.** It needs an HSN code and GST rate from the accountant and at least one image. The photographs in `assets/source-photos` and `Brand details/mx3` are 1280px WhatsApp copies and fail the 2000px upload rule, so originals are needed.
- **Razorpay runs on test keys locally.** No code changed: the existing server action, checkout modal and webhook already cover create, pay and verify. A browser-side verify endpoint was not added, because only the webhook may change order state.

## Hosting moves to Cloudflare Workers (7 October 2026)

Reverses "Hosting on Vercel + Supabase" of 28 September. Supabase stays for Postgres and photos.

- **Why:** Vercel Hobby refused the 15-minute cron and forbids commercial use; the client chose Workers Paid ($5 a month) over Vercel Pro ($20). Workers Free is not an option: the bundle is 5.1 MiB compressed against a 3 MiB limit.
- **The app runs through `@opennextjs/cloudflare`.** Workers KV holds ISR pages, D1 records `revalidatePath` calls, a Durable Object queue runs the re-renders. All three are needed for an admin edit to reach the storefront. KV rather than R2 because R2 was not enabled on the account; KV is eventually consistent, so an edit can take up to a minute to reach every location, for display only.
- **One Prisma client per request on Workers, through Hyperdrive.** A Worker cannot use a socket another request opened, so the shared pool hung. `db.ts` keys a client on the request's execution context; Node (dev, seeds, scripts, tests) keeps the singleton. This answers the 28 September objection about transactions: it is still Postgres, with the same row locks.
- **scrypt is now N=2^15, r=8, p=3,** an OWASP-listed equivalent needing about 32 MB. N=2^17 needs 128 MB, a Workers isolate's whole limit, which was the other 28 September objection. Parameters travel in the hash, so older local hashes still verify. The dummy hash in `auth.ts` must match.
- **Workers will not compile WebAssembly at runtime,** and both Prisma's query compiler and yoga-layout (under `@react-pdf/renderer`) ship theirs as base64 and compile on first use. `scripts/cf-prepare.mjs` extracts both as `.wasm` files, `worker.ts` imports them so they compile at deploy, and each library reads the result from `globalThis.__bbWasm`: Prisma through a patch to the generated client applied by the build, yoga through `patches/yoga-layout@3.2.1.patch`. Prisma's own `runtime = "workerd"` output was tried first and Next cannot bundle it. Both will need re-checking on a Prisma or react-pdf upgrade.
- **The cron is a `scheduled` handler in `worker.ts`** that requests the existing route through a self-binding with `CRON_SECRET`. The route did not change.
- **The Workers build only runs on Linux.** On Windows `next build`'s standalone output fails creating symlinks. It runs in Docker locally and in the `workers-build` CI job; `pnpm dev` is unaffected.
- **`pnpm-workspace.yaml` has a `packages` entry and `package.json` pins `packageManager`,** because Cloudflare's builder defaulted to pnpm 10, which rejects a workspace file without one.
- **First deployed 7 October 2026 to `https://store.brightbluefmcg.workers.dev`,** Worker name `store`, built in a Linux container and deployed with `opennextjs-cloudflare deploy`. Razorpay is on test keys. Production secrets (`AUTH_SECRET`, `CRON_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) were generated for it and are kept in the gitignored `.env.supabase`. Checked live: storefront pages reading Supabase through Hyperdrive, the admin guard, the stale-order route, a signed and a forged webhook, and scrypt under real Workers limits. Still to check live: a real staff login, revalidation after an admin edit, the cron trigger firing, image optimisation, a full test payment.
- **Verified in the Workers runtime against local Postgres:** database pages, staff login, invoice PDF, all 24 `e2e:razorpay` checks, the stale-order route. Not yet verified on a real deployment: Workers memory and CPU limits, revalidation, the cron trigger, image optimisation.
- **`pnpm build` is the Worker build; the Next.js step is `build:next`.** Cloudflare's Git build deployed without building and failed with "Could not find compiled Open Next config". Its build command lives in the dashboard, which the repository cannot see, so on Cloudflare's builder (`WORKERS_CI`) the Worker build also runs at the end of install (`scripts/cf-build.mjs`). That is what made the Git build pass on 7 October.
- **`.env.production` is tracked, public values only.** Next inlines `NEXT_PUBLIC_*` at build and prerenders canonical URLs from the site URL, so a Git build needs them without relying on dashboard variables. Secrets stay in Worker secrets.
- **A Git build has no database, so prerendered pages deploy empty and fill in on their first revalidation,** about a minute later. Setting `DATABASE_URL` as a Cloudflare build variable would close that gap; a deploy from the Docker container already builds against Supabase.

## Admin end-to-end pass (7 October 2026)

- **`pnpm e2e:admin` drives the admin in a real browser** (`scripts/e2e-admin.ts`): sign-in, the role matrix over every admin URL, and create/edit/delete through the real forms for brands, categories, products, variants, images, combos, discounts, stock, orders, reviews, retailers, content and settings, plus server-side role enforcement and a phone-width layout check. Its rows are named `ZZE2E` and removed afterwards. It refuses any non-local database; `--read-only` is the only mode for a hosted site, with `--live-edit` for one reversible announcement-bar change.
- **Results:** 497 of 497 in the Workers runtime against local Postgres, and the same sections on the Node dev server. Money conversions (rupees in, whole paise stored), basis-point GST, the publish guard, null prices and audit rows all held.
- **"Sign out" did not exist, and the first version of it did not work.** The admin had no way to end a session. Added as a server action it redirected to the login page and left the person signed in: the middleware re-issues the session cookie on every request it handles, including the action's own POST. It is now a route handler, `POST /admin/logout`, excluded from the middleware matcher, with its own same-origin check.
- **Two retailers pages overflowed on a phone.** A visually hidden column heading is absolutely positioned, so inside a scroller that was not `relative` it widened the whole page; and the CSV file input had no maximum width.
- **Delivery slabs are stored lightest first.** They were saved in the order typed. Rating already sorted for itself, so no price was ever wrong; this keeps the table readable when reopened.
- **The live site is on the Workers Free plan and fails intermittently with error 1102.** `wrangler tail` shows `exceededCpu` at 10 ms on ordinary pages. Nothing in the code fixes that; it needs Workers Paid. The local Workers runtime does not enforce the limit, which is why the preview passed.
- **Not covered:** anything needing Shiprocket, Resend, MSG91 or a real Razorpay payment. The Shiprocket credentials in the local `.env` are rejected by Shiprocket (403).
- **A refused Shiprocket login is not retried for 30 minutes (12 October 2026).** Every quote, push and tracking read used to log in again with the same wrong password until Shiprocket blocked the API user ("too many failed login attempts"). The pause is keyed to a fingerprint of the credentials, so a corrected password is tried at once; only a 4xx pauses, never an outage.
- **`pnpm e2e:shiprocket` covers the tracking webhook only.** There is no Shiprocket sandbox, so the script blanks the credentials and never pushes an order. It follows the designed flow, in which staff mark an order Packed before a courier scan can move it to Shipped; a scan for an order still at Confirmed is acknowledged and ignored.
- **The Razorpay test keys in `.env`, `.env.production` and `wrangler.jsonc` are rejected by Razorpay (401) as of 12 October 2026.** Online payment cannot start anywhere until new test keys are generated; checkout cancels the order and releases the stock, as designed.
- **The site address is `https://brightbluefmcg.com` (12 October 2026).** `AUTH_URL` and `NEXT_PUBLIC_SITE_URL` still said `workers.dev`, so opening `/admin` on the real domain sent staff to the `workers.dev` login, where the session cookie from the real domain does not exist — sign-in appeared to loop. Canonical tags and the sitemap follow the same value.

## Product add and publish confirmations (12 October 2026)

- **Every product action now says what it did.** Create, save, publish and unpublish redirect to the products list with `?notice=<kind>&product=<id>`; the list words the confirmation from the database row, so no text on the page comes from the address bar. A published product gets a "View it on the store" link.
- **Publish is a button with a pending state, and a draft says what it still needs.** It was an underlined grey word that gave no sign of having been pressed; the audit log shows it being pressed five times in a minute. The publish guard moved to `products/publish-check.ts` so the list, the photos page and the action share one definition of "ready".
- **Publishing and unpublishing revalidate the whole storefront** (`revalidatePath(/, layout)`), as content edits already did, so the store changes at once rather than within a minute.
- **The photo uploader takes several files.** A drop zone, a check as each file is chosen, a description per photo pre-filled with the product name, progress and outcome per photo, and a "Saved photos" count. The photos page ends with the publish step.

- 2026-10-13: Hosting-readiness review retains strict TypeScript and existing commerce stack; Vercel native Node deployment is recommended, with the existing Cloudflare build retained explicitly. Details and limitations in docs/HOSTING-READINESS.md and docs/REVIEW-2026-10.md.
- 2026-10-13: Untracked inventory now fails reservation, matching honest availability; production authentication/checkout fail closed when shared rate limiting is unavailable, while signed webhook delivery remains available.
- 2026-10-13: Indian financial-year numbering uses IST independent of host timezone. Payment validation requires captured INR amount/IDs; failed-state writes are conditional, and only changed transitions schedule side effects.
## Compliance pages for Razorpay live activation (12 October 2026)

- **The seller's details live in `src/lib/business.ts`.** Legal name, GSTIN, addresses, contact, grievance officer and the return, dispatch and refund terms; the footer, /contact, the policies, checkout and the product label details all read it. `contact.ts` now derives from it. Invoices still read the seller from the `Entity` table: change the seller in both places.
- **An unconfirmed detail is `null` and is left off the page, not shown as a `{{placeholder}}`.** The owner's brief asked for visible placeholders; CLAUDE.md forbids placeholder copy and a payment reviewer would see them. Complaints fall back to the business's own contact until a Grievance Officer is named. `missingBusinessDetails()` lists what is owed.
- **Policies now have standing text** (`policy-defaults.ts`), reversing "an unwritten policy has no page". Razorpay refused live keys for the missing pages. A policy published in /admin/content still replaces the standing text word for word. Not reviewed by a lawyer.
- **Policies are at /privacy-policy, /terms, /refund-policy and /shipping-policy; /about redirects to /story.** /policies/[slug] still works and points its canonical at the new address. The footer links all five help pages on every page.
- **The return window (7 days), dispatch (1–3 business days), delivery (3–7) and refund time (5–7) are the brief's proposed values,** not yet confirmed as BBTC's policy. No free-delivery threshold is stated, because checkout has none.
- **The contact email is still the Gmail inbox.** A domain address was asked for, but none is known to exist, and price enquiries go to this address.
- **Checkout requires agreeing to the terms and privacy policy.** UI only; the order and payment code is untouched.
- **Five nullable label columns on `Product`:** country of origin, manufacturer name and address, shelf life, safety warnings. MRP, net quantity (variant size), ingredients, how to use, best before and FSSAI already existed and are reused, not duplicated. An empty manufacturer shows "Marketed by" the seller rather than claiming the seller manufactures it; cleaning and car-care products show a standard caution.
- **Staff sign-in pauses for 15 minutes after five wrong passwords, counted on the `User` row,** because the Upstash limiter allows everything when unconfigured. Someone who knows a staff address can keep it paused; `pnpm user:create` lifts it.
- **A password change raises `User.sessionVersion` and ends every session for that account.** `currentUser()` compares it with the JWT; the middleware layer cannot, so a stale token gets as far as the layout and is sent to sign-in.
- **Staff change their own password at /admin/account,** current password required, 12 characters minimum (the `user:create` floor).
- **The rest of the catalogue is seeded as drafts from the client's brochure brief of 13 October 2026** (`prisma/seed-catalogue.ts`): 51 products and 230 variants across Rafasi, Landfloro, Fairoze, ANSAF, Ilfa Valley and Kenzaniya, plus a 3 L can for each MX-3 fragrance. No prices, HSN, GST rates, ingredients, food labels or photos: the brochures give none, and the publish guard asks for them.
- **Where the brochures disagree and the brief says "confirm", the 16-page brochure was followed:** Rafasi is 10 fragrances in 2 / 3 / 5 L for both Top Load and Front Load (the mini brochure says 2 / 5 L and four unnamed fragrances each); Landfloro is Rose, Butterfly Pea and Lavender in 450 / 250 ml (the mini brochure's table). Not yet confirmed by BBTC.
- **Six Kenzaniya products have no variants** (Skinny Honey, Fennel Seeds, Fenugreek, Mustard Seeds, Red Chilli, Turmeric Powder) because no brochure states their pack sizes.
- **Kenzaniya is one product per food, sized only; Ilfa Valley is one tea product with five grades.** Ingredients, allergens and the FSSAI label differ per food, so they cannot share a product. All sit in the existing top-level categories; no sub-categories were added.
- **Left out of the seed:** the eight MX-3 fragrance names that appear only on the brochure's showcase page, the older 1 L / 500 / 250 ml MX-3 packs and Semi Gel, and MAKAFA, which has no products in any brochure.
- **Brochure health claims are stored as printed** ("Immunity Booster", "Heart Friendly", "Boosts Immunity", "Aids Digestion", "Rich in Antioxidants"). They are on drafts only; whether they may be shown on a food listing is for BBTC to check before publishing.
- **Product photos have no pixel-size rule (13 October 2026, at the owner's request).** Brief §9's "at least 2000px on the long edge" was enforced in the uploader and in `saveProductImageAction`, and refused the photos BBTC actually has. Format, the 20MB cap and the readable-image check stay. This supersedes the note above that the 1280px MX-3 photos fail the upload rule: they can be uploaded now.
- **A photo can belong to the whole product, every variant of one fragrance, or one variant.** One stored file, one `ProductImage` row per variant (rows share `publicId`); no schema change. Deleting removes every row of that photo and then the file. General photos keep their order and cover; cards show general photos first and fall back to a variant photo; the cart falls back from the variant's photo to the product's.
- **Every variant has its own photo page** (`/admin/products/[id]/variants/[variantId]/photos`), reached from the product's Photos page and from the variants list. This replaces the "What is this a photo of?" dropdown, which was 121 choices long on MX-3. One tick shares a photo with the other variants of the same name (the other sizes of a fragrance).
- **Deleting a photo on a variant's page takes it off that variant only;** the stored file goes when the last variant using it lets go. (The earlier behaviour removed it from every variant at once.)
- **Variants are published and unpublished with the same button, wording and said-back result as products** ("Published" / "Draft", replacing "Active" / "Inactive"), from the variants list, the variant's edit page and its photo page, plus "Publish all" / "Unpublish all" on the list. The change refreshes the shop straight away.
- **A product needs at least one published variant to be published,** and the last published variant of a published product cannot be unpublished (unpublish the product instead). Both stop a product reaching the shop with nothing a customer can choose. No data was changed: MX-3's 96 variants were seeded unpublished and now need "Publish all" before the product can go live.
- **A variant's photo and its publish button are both on its row in the variants list.** "Add photo" saves the chosen file to that variant at once, described with the product and variant names; the variant's own photo page stays for changing the description, sharing across sizes and deleting.
- **The two server calls around a photo upload are retried up to three times** (`images/send-photo.ts`). Production cuts requests off intermittently ("Worker exceeded CPU time limit", seen 13 October 2026), and a retry whose first answer was lost treats "already saved" as saved. This softens the hosting limit for uploads; it does not remove it.
- **13 October 2026: 49 draft products were published on production in bulk, without the publish checks,** at the owner's request ("irrespective of photo … for integrating Razorpay and Shiprocket"; asked and confirmed as "everything, as it is"). Done as a data change with an `AuditLog` entry per product; the publish guard in code is unchanged, so unpublishing one and publishing it again still asks for a photo, HSN, GST rate and food label. These products have no photo, price, HSN or GST rate, and 45 are food with no FSSAI label; they show "Price on request" and cannot be bought. Six Kenzaniya products with no variants stayed drafts.
- **Same day: all 96 MX-3 variants were published and the three test products (`test`, `test12`, `test390`) were unpublished.** The test products were not deleted although deletion was asked for: six cancelled orders name their variants, and this schema's rule is never to hard-delete a variant an order could reference. MX-3 is buyable with an HSN of `12243frf45` and a 25% GST rate, both typed in by hand and almost certainly wrong (the owner's own Pineapple dish wash carries 3402 and 18%).
- **13 October 2026: MX-3 is 24 products, one per fragrance, not one product with 96 variants** (`prisma/split-mx3.ts`, run on production). The owner asked for it and had already made "Pineapple Fragrant Dish Wash Liquid" by hand; the other 23 follow its name, short description, usage steps, HSN 3402 and 18% GST. Variant ids and SKUs did not change, so past orders are untouched. Claims are the brochure's five icon claims, not the owner's "Kills Germs", which no brochure makes. The old "MX Three Dish Wash Liquid" is left as an unpublished product with no variants. Two hand-made price-less 900 ml variants were unpublished and their photos moved onto the priced 900 ml variants; one photo landed on the wrong fragrance through a script ordering bug, which was corrected by hand and fixed in the script.
- **Asked what "placeholders" should cover, the owner chose real MX-3 prices only.** No placeholder price, HSN or GST was written for any other brand; they stay "Price on request".
