# Bright Blue store: advanced admin panel + UI bug sweep

## Context

We're building the online store for Bright Blue Trading Corporation (BBTC), an FMCG manufacturer in Kerala. One factory, multiple brands:

- MX-3 (dishwash) — holds the International Book of Records for 24 fragrance variants of one dishwashing liquid
- Rafasi (fabric care), Landfloro (floor care), Fairoze (personal care), ANSAF (car care), Ilfa Valley (tea), Kenzaniya (food/grocery)

The storefront borrows its front-end patterns and animations from cleancult.com. The project appears to be Next.js; confirm by reading the repo.

Two project skills are installed in `.claude/skills/`. Use them:
- `ui-polish` for any visual work or layout bug on the storefront or admin
- `admin-ux` for every admin screen and flow

## How to work

1. Start in plan mode. Read the repo before proposing anything: `package.json`, routing structure, data layer (database/ORM, CMS, or static JSON), auth, image storage, and existing design tokens (colors, type scale, spacing, container widths).
2. Give me a short audit report and a phased plan. Wait for my approval before writing code.
3. Reuse what exists. Do not add a new database, ORM, UI library or state library if the repo already has one. If there is no backend yet, propose two or three options with trade-offs and let me choose.
4. Work one phase at a time. After each phase run typecheck, lint and a production build, fix everything, then commit with a clear message.
5. After this work, no product data is hardcoded in components. The storefront reads from the same data the admin writes.
6. Ask me before changing any customer-facing copy, prices or brand facts.

## Phase 1 — Data model

Design the schema and show it to me before migrating.

- **Brand**: name, slug, category, logo, accent colour, description, sort order, active.
- **Category**: name, slug, parent (optional), sort order.
- **Product**: brand, category, name, slug, short and long description, status (draft / scheduled / published / archived), publish-at date, ordered images with alt text, tags, badges, featured flag, SEO title and description, HSN code, GST rate.
- **Variant**: product, attributes (fragrance, size/pack such as 500 ml, 1 L, 5 L), unique SKU, barcode, MRP, selling price, cost price (optional, admin-only), stock, low-stock threshold, weight, variant images, active. This must handle MX-3's 24 fragrances × multiple pack sizes without pain.
- **Combo / bundle**: name, slug, images, description, items (variant + quantity), optional "customer chooses" slots (pick N from an allowed set of variants, e.g. any 3 MX-3 fragrances), pricing mode (fixed price, % off the sum, or flat ₹ off), validity window, status. Computed, not stored: sum of MRPs, savings in ₹ and %, available stock = min over items of floor(variant stock / quantity).
- **Offer / discount**: type (percentage, flat, buy X get Y, free shipping), scope (store-wide, brand, category, product, variant), auto-apply or coupon code, minimum order value, maximum discount cap, usage limits (total and per customer), start and end, stackable flag, priority.
- **Wholesale price tiers** (optional per variant): quantity breaks with a price, plus a trade-enquiry inbox for the "Bulk & distributor" flow.
- **Audit log**: who changed what, before and after values, when.
- **Admin users and roles**: owner (everything) and editor (no deletes, no user management). Keep it simple.

Store money as integer paise. Display with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` so ₹1,00,000 groups correctly. Prices are MRP inclusive of GST.

## Phase 2 — Admin shell and security

- Routes under `/admin`, protected on the server (middleware and a check inside every server action / API route), not only hidden in the UI.
- Validate every input on the server with a schema (zod or whatever the repo uses).
- Rate-limit login. Restrict upload file types and sizes.
- Layout per the `admin-ux` skill: sidebar (Dashboard, Products, Combos, Offers, Brands, Categories, Inventory, Enquiries, Settings), top bar with a Ctrl/Cmd+K command palette.
- Dashboard stays small: low-stock variants, drafts, offers expiring in 7 days, recent enquiries.

## Phase 3 — Products

Goal: a new product with variants is live in under two minutes.

- One-page form in clear sections (Basics, Images, Variants, Pricing & tax, SEO, Visibility) with a sticky save bar, autosaved drafts, unsaved-changes guard, and Ctrl/Cmd+S to save.
- Slug auto-generated from name, editable, uniqueness checked inline.
- **Variant matrix generator**: I type fragrance values and size values, it generates the grid with auto SKUs. Then I can select rows and bulk-set price, MRP, stock or active status.
- Image upload: drag and drop, multiple at once, reorder by dragging, auto-convert to WebP and resize, alt text field, set cover image.
- "Duplicate product" action.
- "Preview on store" and "Publish" / "Schedule" buttons.
- Product list: searchable, filterable data table (brand, category, status, stock level), sortable columns, URL-synced filters, pagination, bulk actions (publish, archive, adjust price by %, set stock), inline edit for price and stock, low-stock rows clearly flagged.
- CSV import and export for products and variants. Import runs a dry run first and shows a validation report (row, field, problem) before anything is written.

## Phase 4 — Combo builder

- Search and add variants, quantity steppers, add "customer chooses" slots.
- Live price panel: sum of MRPs, combo price, savings in ₹ and %, margin warning if the combo price drops below total cost, current available stock.
- Live preview of the combo card exactly as it will render on the storefront.
- Combos appear on the storefront with their own pages and in relevant product pages ("Save with a combo").
- If a component variant goes out of stock or inactive, the combo shows as unavailable automatically and the admin list flags it.

## Phase 5 — Offers and coupons

- Form with a live summary: "Applies to 38 products across MX-3 and Rafasi".
- Warn when a new offer overlaps an existing one on the same products, and show which one wins by priority and stacking rules.
- Cart and checkout apply offers through one pricing function that has unit tests (percentage, flat, cap, minimum order, BXGY, expired, usage limit reached, stacking).

## Phase 6 — Inventory and enquiries

- Inventory view across all variants with quick stock adjust and a reason (restock, damage, correction) written to the audit log.
- Trade enquiry inbox with status (new, contacted, closed) and notes.

## Phase 7 — Storefront UI bug sweep

Follow the `ui-polish` skill. First, screenshot every storefront page with Playwright at 360, 390, 768, 1024, 1280 and 1536 px widths. Build an issue list with severity before fixing anything.

Known issues on the homepage (seen at about 1536 px wide):

1. **Brand table under "Eight houses, one factory"**: column widths are uneven. Use equal grid columns (`repeat(n, minmax(0, 1fr))`) or `table-layout: fixed`, and make it scroll inside its own container on small screens.
2. **Stats row** (Made in Kerala / Eight brands / Bulk & distributor / Since 2019): its four columns don't line up with the column lines of the brand table below, and the descriptions wrap unevenly (two lines, two lines, one line, one line). Put both sections on the same container and grid, and give the descriptions a consistent max width.
3. **Section spacing**: the gap between the stats row and "Eight houses, one factory" is far larger than other section gaps (section padding plus a divider plus more padding). The divider is full-bleed while the content is contained. Define a section spacing scale as tokens and apply it everywhere; pick one divider treatment.
4. **Record band** ("24 fragrance variants of one dishwashing liquid"): the text sits in the left half with the right half empty, and the bottom padding is heavier than the top. Balance the padding, and propose a right-side visual (for example the record certificate or an MX-3 fragrance lineup). Make sure "24" and the headline share a baseline (`align-items: baseline`), that tight line-height on the display type doesn't clip letters, and that the headline wraps cleanly on mobile.
5. **Copy consistency (ask me before changing)**: the page says "Eight brands" and "Eight houses", but the brand list above has seven. The founder appears as "Mr. Faisal V.K." in one place and "V.K. Faisal" in another. Once confirmed, derive the brand count from data instead of hardcoding it, and standardise the name.
6. The Next.js dev indicator (the "N" badge, bottom-left) overlaps content in dev screenshots. It is not a production bug; set `devIndicators: false` in `next.config` so screenshots are clean.

I'll also attach more screenshots of other issues. Add them to the same list.

After the known issues, run the full `ui-polish` checklist across all pages and fix root causes (shared container, tokens, grid) rather than one-off margins.

## Phase 8 — Verification

- Playwright end-to-end tests: log in, create a product with the variant generator, upload images, publish, see it on the storefront; build a combo and add it to cart; create a coupon and apply it at checkout.
- Before and after screenshots for every UI issue fixed, at all six widths, saved to `/qa/screenshots/`.
- Lighthouse on home, a product page and a combo page: no layout shift from animations or images, accessibility score 95+.
- Final summary: what was built, what was fixed, anything left open, and any decision you need from me.

## Definition of done

- Typecheck, lint, build and all tests pass.
- No horizontal scroll at 360 px on any page.
- No hardcoded product, brand or price data in storefront components.
- Every admin action is protected server-side and logged.
- Every item in the Phase 7 issue list is fixed or explicitly deferred with a reason.
