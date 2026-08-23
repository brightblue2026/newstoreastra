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
  variant of the slot's own product, and exactly as many picks as the slot has units. A
  combo's price is its package price either way, so a forged choice buys nothing cheaper;
  what it could do is put a fragrance BBTC never offered onto a picking list. The
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
