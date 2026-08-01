# Bright Blue Store — Master Brief for Claude Code

**Version 2.0 — 1 August 2026**
**This document supersedes all previous PRDs and revision documents.**
Where anything conflicts with an earlier file, this one wins.

Sources: the BBTC company brochure (16pp, July 2026), brightblue.in (live WooCommerce
store), brightblue.vercel.app (brand site). Everything below came from one of those three.
Where a fact was absent at source it is marked `UNKNOWN` and never guessed.

---

## 0. Instructions for Claude Code

1. Read this document fully before writing any code.
2. Build in the phase order in §12. Each phase has acceptance criteria — verify before
   moving on. Do not skip ahead.
3. **All money is `Int` in paise.** ₹149.00 is `14900`. No floats, ever. One
   `formatINR()` helper, in `src/lib/money.ts`.
4. **GST rate is per product, never global.** This catalogue spans detergents, cosmetics,
   and a dozen food categories at different rates.
5. When a decision is ambiguous, choose the option that keeps the admin panel simpler.
   The people using it are not technical.
6. Ask before adding a dependency outside the stack in §5.
7. Log every judgement call not covered here in `DECISIONS.md`, one line each.
8. §14 lists open questions. Six of them block Phase 1. Ask before the first migration.

---

## 1. What this project is

Bright Blue Trading Corporation (BBTC) is an FMCG manufacturer and distributor based in
Pullepady, Ernakulam, Kerala, founded in 2019 by **V.K. Faisal**, Chairman & Managing
Director.

Their current store, brightblue.in, is a WordPress/WooCommerce install on a purchased
XStore theme. It is not usable: every product shows ₹0.00 except five, the hero slider
still carries a bicycle image from the theme demo, category thumbnails are WooCommerce
placeholders, a shipping bar advertises "free shipping over $49" in US dollars, and there
is untranslated lorem ipsum in a feature block.

There is also a well-built corporate brand site at brightblue.vercel.app — scroll-driven,
with drag-to-rotate 3D product views, the founder narrative, and the group structure. Its
canonical URL already points at brightblue.in.

**We are building a third thing:** a purpose-built commerce application with a storefront
and a dedicated admin panel where non-technical staff run products, pricing, offers,
discounts, and combos without a developer.

**Design reference:** cleancult.com — for its category-first navigation, the badge row of
product claims under the hero, single-colour brand discipline, and clean product
photography on flat fields. Structural and typographic discipline only; Bright Blue gets
its own identity (§9).

Note that cleancult is itself headless — Next.js, Contentful, separate commerce backend.
**We are deliberately not going headless.** See §4.

---

## 2. The headline asset — lead with this

> **International Book of Records holder for the Maximum Number of Fragrance Variants
> Created for a Dishwashing Liquid Brand — 24 Signature Fragrances.**
> Awarded to Mr. Faisal V.K. for Bright Blue Trading Corporation.

This is the single strongest thing BBTC owns and it appears nowhere on either existing
site. No competitor in Indian home care — Koparo, Beco, The Better Home — has anything
comparable.

It anchors the homepage. It justifies the fragrance grid as the site's signature
interaction rather than a gimmick. Build the design around it.

---

## 3. Scope — this is far larger than a dish wash store

The brochure reveals **seven brands across cleaning, personal care, and food**, with well
over 100 SKUs. Earlier planning documents assumed one brand and six fragrances. That was
wrong by an order of magnitude.

| # | Brand | Segment | Range | Sizes (per brochure) |
| --- | --- | --- | --- | --- |
| 1 | **MX-3** | Dish care | Dish wash liquid, 24 fragrances | 900 ml / 450 ml / 225 ml |
| 2 | **Rafasi** | Fabric care | Cloth wash liquid, ~10 variants, front load + top load | 2 L / 3 L / 5 L |
| 3 | **Landfloro** | Home care | Floor cleaner — Rose, Butterfly Pea | 450 ml |
| 4 | **Fairoze** | Personal care | Hand wash + body wash — Jasmin, Rose, Lavender, Sandalwood | UNKNOWN |
| 5 | **ANSAF** | Car care | Foam wash, wash & shine | 500 ml |
| 6 | **Ilfa Valley** | Beverages | Loose tea, herbal tea bags | 1 kg jar, 25 bags |
| 7 | **Kenzaniya** | Food & grocery | Six sub-ranges — see below | Various |

**Kenzaniya alone is a full grocery catalogue:**

| Sub-range | Items | Sizes |
| --- | --- | --- |
| Honey | Jamun, Multi Floral, Wild Flower, Tulsi, Skinny | UNKNOWN |
| Kerala Spices | Cinnamon, Cloves, Cardamom, Black Pepper, Dry Ginger, Fennel Seeds, Fenugreek, Mustard Seeds, Red Chilli, Turmeric Powder | 250 ml |
| Nuts | Almonds, Cashew, Skin Cashew, Walnut, Black Raisins, Pepper Peanut, Salt Peanut | UNKNOWN |
| Seeds | Chia, Pumpkin, Flax, Sunflower, Multi Sweet Seed, Trail Mix | UNKNOWN |
| Pickles | Garlic, Lemon, Green Mango, Green Kanni Manga, + others | UNKNOWN |
| Staples | Marayoor Sharkara, Premium Ghee, Jowar & Ragi Flour, Himalayan Pink Salt | Ghee 900 ml / 450 ml |

**Two consequences that reshape the build:**

1. **Food is the majority of the catalogue, not a corner of it.** FSSAI licensing and
   per-item GST rates move from edge cases to core requirements. See §10.
2. **Fairoze is cosmetics.** Hand wash and body wash fall under India's Drugs and
   Cosmetics Act, which is a different regulatory regime again — manufacturing licence
   number and mandatory label declarations. This brand appears on neither website and was
   in no earlier document.

---

## 4. Architecture

One Next.js 15 application, one Postgres database, one Vercel deployment. Storefront and
admin are route groups in the same codebase, sharing types, the Prisma client, and the
pricing engine.

```
┌──────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router) — single Vercel deployment       │
│                                                            │
│  /(storefront)   server components, ISR 60s               │
│  /admin          dynamic, role-gated, no cache            │
│  /api            webhooks + cart routes                   │
└───────────────┬────────────────────────────────────────────┘
                │
   ┌────────────┼─────────────┬──────────────┬──────────────┐
   ▼            ▼             ▼              ▼              ▼
PostgreSQL  Cloudinary    Razorpay      Shiprocket    Resend/MSG91
(Prisma)    (images)      (payments)    (logistics)   (comms)
```

**Why not headless.** Headless makes every banner change and every new offer layout a
developer ticket. Cleancult can afford that; they have an in-house team. BBTC needs staff
in Ernakulam to change a price on a Tuesday afternoon without calling anyone. Revisit only
above roughly ₹50 lakh/month online revenue.

**The client is never trusted with money.** The browser cart holds variant IDs and
quantities, not prices. At checkout the server re-reads every price, re-runs
`calculateCart()`, and that server total creates the Razorpay order. Payment confirmation
comes only from a signature-verified webhook.

**Order creation is one Prisma `$transaction`:** re-read prices → re-run pricing →
check inventory → increment `reserved` → generate order number → create Order and
OrderItem snapshots → increment discount usage. Any failure rolls back the lot.

**Rendering:** home, brand, category, and product pages use ISR at 60s with on-demand
`revalidatePath` on admin save. Cart, checkout, account, and all of `/admin` are dynamic
and `no-store`.

---

## 5. Stack — locked

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 App Router, TypeScript strict |
| Styling | Tailwind CSS v4 |
| Admin primitives | shadcn/ui |
| Database | PostgreSQL (Neon) |
| ORM | Prisma |
| Validation | Zod, on every input, client and server |
| Forms | React Hook Form + Zod resolver |
| Auth | Auth.js v5 — email/password for staff, phone OTP for customers |
| Payments | Razorpay |
| Logistics | Shiprocket (aggregates DTDC, which BBTC already uses) |
| Images | Cloudinary |
| Email | Resend |
| WhatsApp/SMS | MSG91 |
| PDF invoices | @react-pdf/renderer |
| Cart state | Zustand — nothing heavier, no Redux |
| Hosting | Vercel |
| Errors | Sentry |

Not using: any headless CMS, Redux, or a component library beyond shadcn.

---

## 6. Roles

| Role | Capabilities |
| --- | --- |
| `GUEST` | Browse, cart, guest checkout |
| `CUSTOMER` | + saved addresses, order history, reorder |
| `STAFF` | View orders, update fulfilment, print invoices and labels. **Cannot** see or change prices, products, or discounts |
| `MANAGER` | + create/edit products, variants, combos, discounts, inventory, content |
| `ADMIN` | + user management, settings, financial reports, audit log |

Enforced in the admin layout, in middleware, **and** in every server action. Three layers,
because hiding a menu item is not access control.

---

## 7. Data model

Prisma schema. This is the contract.

```prisma
// ---------- Brand & catalogue ----------

model Brand {
  id             String    @id @default(cuid())
  name           String                        // "MX-3", "Kenzaniya"
  slug           String    @unique
  tagline        String?
  story          String?   @db.Text
  logoUrl        String?
  accentHex      String                        // drives the brand accent layer
  segment        Segment
  fssaiLicence   String?                       // required when segment = FOOD
  cosmeticLicence String?                      // required when segment = PERSONAL_CARE
  sortOrder      Int       @default(0)
  isActive       Boolean   @default(true)
  products       Product[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

enum Segment { HOME_CARE DISH_CARE FABRIC_CARE CAR_CARE PERSONAL_CARE FOOD BEVERAGE }

model Category {
  id          String     @id @default(cuid())
  name        String                          // "Kerala Spices"
  slug        String     @unique
  parentId    String?                         // supports Kenzaniya's sub-ranges
  parent      Category?  @relation("CatTree", fields: [parentId], references: [id])
  children    Category[] @relation("CatTree")
  description String?
  imageUrl    String?
  sortOrder   Int        @default(0)
  isActive    Boolean    @default(true)
  products    Product[]
}

model Product {
  id            String           @id @default(cuid())
  name          String
  slug          String           @unique
  brandId       String
  brand         Brand            @relation(fields: [brandId], references: [id])
  categoryId    String
  category      Category         @relation(fields: [categoryId], references: [id])
  shortDesc     String
  description   String           @db.Text
  hsnCode       String?                        // null until the accountant confirms
  gstRate       Int?                           // basis points; 1800 = 18%
  claims        Json                           // [{ icon, label }] — the badge row
  ingredients   String?          @db.Text
  usageSteps    Json?
  // Regulatory
  isFoodProduct Boolean          @default(false)
  isCosmetic    Boolean          @default(false)
  foodLabel     Json?            // netQty, batch, mfgDate, bestBefore, vegMark,
                                 // nutrition, allergens — required when isFoodProduct
  isActive      Boolean          @default(true)
  isFeatured    Boolean          @default(false)
  sortOrder     Int              @default(0)
  variants      ProductVariant[]
  images        ProductImage[]
  reviews       Review[]
  metaTitle     String?
  metaDesc      String?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@index([brandId, isActive])
  @@index([categoryId, isActive])
}

// The buyable unit. MX-3 is fragrance × size × format; Kenzaniya spices are just size.
model ProductVariant {
  id             String         @id @default(cuid())
  productId      String
  product        Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  sku            String         @unique
  variantName    String?                      // "Lemon", "Jasmin", "Cardamom"
  variantHex     String?                      // fragrance/flavour accent
  size           String                       // "900 ml", "250 g", "5 L"
  format         String?                      // "Liquid", "Semi-Gel", "Front Load"
  mrpPaise       Int?
  pricePaise     Int?                         // null = "Price on request"
  wholesalePaise Int?                         // B2B tier, hidden at launch
  weightGrams    Int?
  barcode        String?
  isActive       Boolean        @default(true)
  inventory      Inventory[]
  images         ProductImage[]

  @@index([productId, isActive])
}

model ProductImage {
  id        String          @id @default(cuid())
  productId String?
  product   Product?        @relation(fields: [productId], references: [id], onDelete: Cascade)
  variantId String?
  variant   ProductVariant? @relation(fields: [variantId], references: [id], onDelete: Cascade)
  url       String
  publicId  String
  alt       String
  sortOrder Int             @default(0)
}

// ---------- Combos ----------
// A sellable package at a package price. NOT a discount rule.

model Combo {
  id          String      @id @default(cuid())
  name        String
  slug        String      @unique
  shortDesc   String
  description String      @db.Text
  imageUrl    String?
  pricePaise  Int
  isActive    Boolean     @default(true)
  isFeatured  Boolean     @default(false)
  items       ComboItem[]
}

model ComboItem {
  id        String         @id @default(cuid())
  comboId   String
  combo     Combo          @relation(fields: [comboId], references: [id], onDelete: Cascade)
  variantId String
  variant   ProductVariant @relation(fields: [variantId], references: [id])
  quantity  Int            @default(1)
  isChoice  Boolean        @default(false)   // customer picks the fragrance for this slot
  choiceOf  String[]                          // restrict options; empty = any in product
}

// ---------- Inventory ----------

model Location {
  id        String      @id @default(cuid())
  name      String
  address   String
  pincode   String
  handles   Segment[]                        // food packing centre vs machineries etc.
  isActive  Boolean     @default(true)
  inventory Inventory[]
}

model Inventory {
  id         String         @id @default(cuid())
  variantId  String
  variant    ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  locationId String
  location   Location       @relation(fields: [locationId], references: [id])
  quantity   Int            @default(0)
  reserved   Int            @default(0)
  lowStockAt Int            @default(10)

  @@unique([variantId, locationId])
}

// ---------- Offers ----------

enum DiscountType { PERCENTAGE FIXED_AMOUNT BUY_X_GET_Y FREE_SHIPPING TIERED_QUANTITY }
enum DiscountScope { ORDER BRAND CATEGORY PRODUCT COMBO }

model Discount {
  id               String        @id @default(cuid())
  name             String                       // internal
  publicLabel      String?                      // shown on the cart line
  code             String?       @unique        // null = automatic
  type             DiscountType
  scope            DiscountScope
  valuePaise       Int?
  valueBps         Int?
  tiers            Json?                        // [{minQty, valueBps}]
  buyQty           Int?
  getQty           Int?
  minOrderPaise    Int?
  maxDiscountPaise Int?
  targetIds        String[]
  usageLimit       Int?
  usageCount       Int           @default(0)
  perCustomerLimit Int?
  stackable        Boolean       @default(false)
  priority         Int           @default(0)
  startsAt         DateTime
  endsAt           DateTime?
  isActive         Boolean       @default(true)

  @@index([isActive, startsAt, endsAt])
}

// ---------- Customers & orders ----------

enum UserRole { CUSTOMER STAFF MANAGER ADMIN }

model User {
  id           String    @id @default(cuid())
  name         String?
  email        String?   @unique
  phone        String?   @unique
  passwordHash String?                        // staff only
  role         UserRole  @default(CUSTOMER)
  isActive     Boolean   @default(true)
  addresses    Address[]
  orders       Order[]
  reviews      Review[]
  createdAt    DateTime  @default(now())
}

model Address {
  id        String  @id @default(cuid())
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullName  String
  phone     String
  line1     String
  line2     String?
  city      String
  state     String
  pincode   String
  isDefault Boolean @default(false)
}

enum OrderStatus { PENDING_PAYMENT CONFIRMED PACKED SHIPPED DELIVERED CANCELLED RETURNED REFUNDED }
enum PaymentMethod { RAZORPAY COD }
enum PaymentStatus { PENDING PAID FAILED REFUNDED }

model Order {
  id                String        @id @default(cuid())
  orderNumber       String        @unique       // "BB-2627-00001" (financial year)
  userId            String?
  user              User?         @relation(fields: [userId], references: [id])
  guestEmail        String?
  guestPhone        String?
  items             OrderItem[]

  subtotalPaise     Int
  discountPaise     Int           @default(0)
  shippingPaise     Int           @default(0)
  codFeePaise       Int           @default(0)
  cgstPaise         Int           @default(0)
  sgstPaise         Int           @default(0)
  igstPaise         Int           @default(0)
  totalPaise        Int
  taxByHsn          Json          // [{hsn, rate, taxable, cgst, sgst, igst}] — mixed-rate carts

  appliedDiscounts  Json
  shippingAddress   Json          // snapshot, never a relation
  billingAddress    Json

  status            OrderStatus   @default(PENDING_PAYMENT)
  paymentMethod     PaymentMethod
  paymentStatus     PaymentStatus @default(PENDING)
  razorpayOrderId   String?
  razorpayPaymentId String?

  shiprocketOrderId String?
  awbNumber         String?
  courierName       String?
  trackingUrl       String?

  sellerEntityId    String        // which BBTC entity sold this — see §11
  invoiceNumber     String?       @unique
  invoiceUrl        String?

  notes             String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([status, createdAt])
  @@index([userId])
}

model OrderItem {
  id             String   @id @default(cuid())
  orderId        String
  order          Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  // Snapshots — a product edit must never alter a historical order
  variantId      String?
  comboId        String?
  nameSnapshot   String
  skuSnapshot    String
  imageSnapshot  String?
  choiceSnapshot Json?                        // fragrances picked for combo choice slots
  quantity       Int
  unitPricePaise Int
  totalPaise     Int
  hsnCode        String
  gstRate        Int
}

model Review {
  id         String   @id @default(cuid())
  productId  String
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  authorName String
  rating     Int
  title      String?
  body       String   @db.Text
  isApproved Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@index([productId, isApproved])
}

// ---------- Company & content ----------

model Entity {
  id          String   @id @default(cuid())
  legalName   String
  abbr        String?
  role        String                          // "Head Office", "Food Packing Centre"
  address     String
  city        String?
  state       String?
  country     String   @default("India")
  pincode     String?
  gstin       String?
  isSeller    Boolean  @default(false)        // can appear on an invoice
  isActive    Boolean  @default(true)
}

model ContentBlock {
  id        String   @id @default(cuid())
  key       String   @unique      // "home_hero", "announcement_bar", "world_record"
  data      Json                  // Zod-validated per key
  isActive  Boolean  @default(true)
  updatedAt DateTime @updatedAt
}

model Retailer {
  id       String  @id @default(cuid())
  name     String
  address  String
  city     String
  district String
  pincode  String
  phone    String?
  isActive Boolean @default(true)
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String
  action     String
  entityType String
  entityId   String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
}
```

**Schema rules**

- Every `*Paise` field is `Int`. No `Decimal`, no `Float`.
- Every `*Bps` field is basis points. 18% is `1800`.
- `pricePaise` is nullable on purpose. Most of this catalogue has no published price yet;
  null renders as "Price on request", never as ₹0.00. **Do not seed placeholder prices** —
  that is exactly how the current site ended up showing ₹0.00 on everything.
- `OrderItem` and `Order.shippingAddress` are snapshots. Never relations.
- Soft-delete via `isActive`. Never hard-delete a variant that could appear in an order.
- Cascade only parent→child within the catalogue. Never cascade into `Order`.

---

## 8. Pricing engine

`src/lib/pricing.ts` is the most important module here. Build and test it before any UI
touches it.

```ts
export function calculateCart(input: {
  lines: CartLine[]                       // { kind, id, quantity, unitPricePaise, brandId?, categoryId?, productId? }
  discountCode?: string
  shippingState?: string
  shippingPincode?: string
  paymentMethod: 'RAZORPAY' | 'COD'
  customerId?: string
}): PriceResult
```

The function is pure — it receives discount and settings data, it does not query.

**Rule order. Order changes the answer.**

1. Line subtotals: `unitPricePaise × quantity`.
2. Gather candidates: active automatic discounts inside their window, plus the coupon if
   supplied and valid.
3. Filter: drop any failing `minOrderPaise`, `usageLimit`, `perCustomerLimit`, or whose
   scope matches no line.
4. Apply BRAND, CATEGORY, PRODUCT, and COMBO scoped discounts to matching lines.
5. Apply ORDER scoped discounts to the remaining subtotal.
6. Conflicts: when two applicable discounts are both `stackable: false`, keep the higher
   `priority`; break ties by larger rupee value to the customer.
7. Cap percentages at `maxDiscountPaise`.
8. Clamp at zero. Never a negative total.
9. Shipping, then COD fee.
10. **Tax last, on the post-discount amount, per HSN** — see §10.

**Combos:** `Combo.pricePaise` *is* the price. Never derive it from components. The page
shows the component sum struck through for display only.

**Rounding:** integer paise throughout. Distribute discounts proportionally with
`Math.floor`, assign the remainder to the largest line, then assert that line discounts
sum exactly to `discountPaise`. Fail loudly in development if they don't.

**Tests that must pass before Phase 4:**

- [ ] Empty cart returns zeros without throwing
- [ ] 10% capped at ₹100 on a ₹2,000 cart gives exactly ₹100
- [ ] Two non-stackable discounts: only the higher priority applies
- [ ] Priority tie resolves to the larger customer saving
- [ ] `minOrderPaise` ₹500 excludes ₹499, includes ₹500 exactly
- [ ] TIERED_QUANTITY picks correctly at exactly 3 and exactly 6
- [ ] BUY_X_GET_Y discounts the cheapest unit of each group
- [ ] Kerala address → CGST + SGST, zero IGST
- [ ] Tamil Nadu address → IGST, zero CGST/SGST
- [ ] CGST + SGST always equals what IGST would have been
- [ ] **Mixed-rate cart** — 18% dish wash + 12% ghee + nil-rated jaggery produces three
      correct HSN groups in `taxByHsn`
- [ ] Discount exceeding subtotal clamps; total never negative
- [ ] Expired, not-yet-started, and exhausted discounts are ignored
- [ ] Combo prices at package price, not component sum
- [ ] FREE_SHIPPING zeroes shipping, leaves COD fee intact
- [ ] Line discounts sum exactly to `discountPaise`, no drift
- [ ] Every returned value is an integer

---

## 9. Design system

### The idea

The distinctive material here is **the range itself** — seven brands, 24 dish wash
fragrances, ten Kerala spices, five honeys. And BBTC holds a world record for exactly
that. So the design is about breadth held under discipline, not about any one bottle.

The site is chromatically neutral — deep navy ink on warm off-white paper — until a brand
enters the frame. Then that brand owns the accent layer, and nothing else does.

**Discipline rule:** exactly one accent colour is live on screen at a time. It appears in
the product image field and the selected swatch. Never on body text. Never on the CTA —
the CTA is always signal blue. Without this the page becomes a fruit salad and the world
record reads as chaos rather than range.

### Tokens

```css
--bb-ink:      #0B1F3A;   /* text, header, footer */
--bb-ink-soft: #3C4F6B;   /* secondary text */
--bb-paper:    #FAF7F2;   /* page background — BBTC's own declared theme colour */
--bb-line:     #E3E0D8;   /* hairlines */
--bb-signal:   #0F9CD6;   /* CTAs, links, focus rings — the one "bright blue" */
--bb-success:  #2E7D5B;
--bb-warning:  #B4501C;
```

Brand accents, stored on `Brand.accentHex` so a manager can change them without a deploy:

```
MX-3         #F2C14E   lemon-lime
Rafasi       #8E7CC3   jasmine violet
Landfloro    #C77B9E   rose
Fairoze      #7FB7C4   clean aqua
ANSAF        #3E8FB0   water blue
Ilfa Valley  #6E8B4A   tea leaf
Kenzaniya    #C2703D   sharkara amber
```

Fragrance and flavour accents live on `ProductVariant.variantHex`. **Derive these from the
actual bottle artwork rather than inventing them** — brightblue.in already hosts artwork
for all 24 MX-3 fragrances at `/wp-content/uploads/2026/05/`. Extract the dominant colour
at seed time and let a manager override in the admin.

### Typography

| Role | Face | Weights |
| --- | --- | --- |
| Display | Clash Display (Fontshare, free) | Medium 500, Semibold 600 |
| Body | Satoshi (Fontshare, free) | Regular 400, Medium 500, Bold 700 |
| Utility | JetBrains Mono | Regular — SKUs, order numbers, admin tabular figures |

Self-hosted via `next/font/local`. **Do not use Inter** — it is the default that makes
every AI-assisted build look identical.

```
display-lg   clamp(2.5rem, 6vw, 4.5rem)    Clash Display 600, -0.02em, 1.05
display-sm   clamp(1.75rem, 4vw, 2.5rem)   Clash Display 500, -0.01em, 1.15
heading      1.5rem                         Clash Display 500, 1.25
subhead      1.25rem                        Satoshi 500, 1.4
body-lg      1.125rem                       Satoshi 400, 1.6
body         1rem                           Satoshi 400, 1.6
caption      0.875rem                       Satoshi 500, +0.02em, uppercase
```

Prices use `font-variant-numeric: tabular-nums` so digits don't jump when a variant with a
different price is selected.

### Layout

12-column grid, 1280px max width. Gutters 24px mobile / 40px desktop. Spacing scale 4, 8,
12, 16, 24, 32, 48, 64, 96 — nothing between. Section rhythm 64px mobile / 96px desktop.

Radius: 4px inputs and buttons, 16px cards, full on swatches. No fourth radius.
Elevation: one shadow, `0 1px 3px rgba(11,31,58,0.08)`. Depth comes from hairlines.
Buttons: solid signal-blue primary, 1px ink outline secondary. No third style.
Focus: 2px signal ring at 2px offset, always visible.

### The two signature interactions

**Homepage — brand rail.** Seven brands in a horizontal scroller. Hover or tap shifts the
section background to that brand's accent and swaps in its product. 240ms ease-out on
`background-color`.

**MX-3 product page — the 24-fragrance grid.** This is where the world record becomes
tangible. A rail won't hold 24; use a 6×4 grid on desktop, 4×6 on mobile. Each swatch is a
filled circle with the name beneath. Group by family — citrus, berry, tropical, green,
floral, herbal — so 24 reads as a considered range rather than a wall. Selecting one
shifts the product image, shifts the image field background, and updates the URL query so
a fragrance is linkable.

The one-accent rule holds at both levels: brand accent at the portfolio level, variant
accent within a brand.

### Motion budget — total

| Interaction | Duration |
| --- | --- |
| Brand rail / fragrance grid background shift | 240ms ease-out |
| Cart drawer slide | 200ms |
| Card hover lift, 2px | 120ms |

Everything else is instant. No scroll-jacking, no parallax, no page-load choreography. All
of it respects `prefers-reduced-motion`.

### Photography

- One product, centred, on a flat colour field matching its accent
- No lifestyle clutter, no hands, no kitchen sinks
- 1:1 for cards, 4:5 for the product hero
- 2000px minimum on the long edge before Cloudinary
- **No stock photography on any product or category page.** The current site uses stock
  hands and a bicycle from the theme demo. None of it survives.

Enforce as an upload checklist shown inline in the admin.

**Port the 3D drag-to-rotate viewers** from brightblue.vercel.app into the product gallery
as the first item, with a static fallback when JavaScript is off. Nothing in Indian home
care has them.

### Voice

Plain, confident, specific. State what the product does; don't sell it. Sentence case.

**No emoji anywhere on the storefront.** The current product descriptions are emoji-dense
and read as amateur for a manufacturer selling to distributors as well as households.

Actions keep their name through the flow: "Add to cart" → "Added to cart". Errors name
what went wrong and what to do. Empty states offer a next action.

**Savings in rupees, not percent.** "Save ₹90" beats "Save 15%" in low-ticket FMCG.

---

## 10. India compliance

### GST — three regimes in one catalogue

This is the hardest requirement in the project and earlier documents underestimated it
badly. A single order can contain a detergent, a cosmetic, and three food items at three
different rates.

Indicative rates. **All require the accountant's confirmation against the current CBIC
schedule before launch** — the GST Council revises rates several times a year.

| Segment | Products | HSN family | Indicative |
| --- | --- | --- | --- |
| Detergents | MX-3, Rafasi, Landfloro, ANSAF | 3402 | 18% |
| Personal care | Fairoze hand wash, body wash | 3401 / 3402 | Liquid hand wash is commonly 18%; bar soap 5% |
| Ghee | Kenzaniya Premium Ghee | 0405 | 12%, though packaged foods moved after Sept 2025 — verify |
| Honey | Five Kenzaniya honeys | 0409 | Verify — natural honey often nil-rated |
| Spices | Ten Kerala spices | Chapter 9 | Commonly 5%; turmeric powder differs from fresh |
| Salt | Himalayan pink salt | Chapter 25 | Edible salt commonly nil |
| Jaggery | Marayoor Sharkara | Chapter 17 | Cane jaggery is exempt |
| Nuts & seeds | Almonds, cashew, chia, flax | Chapters 8 / 12 | Varies per item |
| Pickles | Garlic, lemon, mango | Chapter 20 | Verify |
| Tea | Ilfa Valley | Chapter 9 | Verify |
| Flour | Jowar, ragi | Chapter 11 | Branded packaged differs from loose |

**Implementation consequences:**

- `Product.hsnCode` and `Product.gstRate` are per product and nullable. A product cannot
  be published without both.
- `Order.taxByHsn` stores a per-HSN breakdown. **The invoice shows a per-HSN tax summary
  table**, not one blended rate. This is not optional for a mixed catalogue.
- Place of supply is Kerala. Delivery to Kerala → CGST + SGST at rate/2 each. Anywhere
  else → IGST at the full rate.
- Displayed prices are GST-inclusive, per Indian retail convention. Back-calculate:
  `taxable = round(inclusive × 10000 / (10000 + gstRate))`, then `tax = inclusive − taxable`.
  Subtracting guarantees the figures reconcile exactly to the amount charged.
- Invoice numbers: sequential per financial year, no gaps, generated inside the order
  transaction.

### FSSAI — blocking for the majority of the catalogue

Kenzaniya and Ilfa Valley are food, and together they are most of the SKU count. Selling
food online in India requires FSSAI registration or licence with the number displayed.

Build:
- `Brand.fssaiLicence`, shown on food product pages and on the invoice
- `Product.foodLabel` — net quantity, batch/lot, manufacture date, best-before, veg mark,
  nutritional information, allergen declaration, packer name and address
- `Product.isFoodProduct` makes those fields **required at publish**

Confirm BBTC's FSSAI status and whether it covers ecommerce sale before Phase 1. If it
doesn't, those brands cannot list online.

### Cosmetics — Fairoze

Hand wash and body wash fall under the Drugs and Cosmetics Act, a separate regime again:
manufacturing licence number and mandatory label declarations. `Brand.cosmeticLicence` and
`Product.isCosmetic` exist for this. Confirm licence status before listing Fairoze.

### Payments

Razorpay Checkout covers UPI, cards, netbanking, wallets. UPI will be the majority of
prepaid volume.

Server creates the Razorpay Order with the authoritative amount. The browser never sends
an amount. On success the browser shows *pending* — it does not mark the order paid.
`POST /api/webhooks/razorpay` verifies the HMAC-SHA256 signature against the raw body,
then transitions to CONFIRMED and PAID, idempotent by `razorpayPaymentId`.

Never trust the client-side success handler to change order state.

### COD

Not optional in this market. Controls in admin settings: pincode allowlist, flat fee
(not discountable), minimum and maximum order value, global toggle.

**Risk:** COD carries return-to-origin cost, and it is worse on food. Launch on a
Kerala-and-adjacent allowlist, measure RTO for two months, then expand.

### Shipping — Shiprocket

Aggregates DTDC, which BBTC already uses, and handles COD remittance. Serviceability and
rate by pincode on the product page and at checkout; order push, AWB, label, tracking
webhook.

**Fallback:** on timeout or failure at checkout, use the admin's flat-rate weight slab
table. Never block an order because a third party is down.

Food may ship from a different location than detergents — see the entity list in §11, which
includes a dedicated Food Packing Centre in Malappuram and a Foods & Beverages unit in
Thrissur. `Location.handles` carries the segments each site can fulfil.

### Communications

WhatsApp via MSG91 for order confirmed / shipped with AWB / out for delivery / delivered,
SMS fallback. Email via Resend for the invoice PDF. WhatsApp is read in this market; email
often is not. **Submit MSG91 templates for approval during Phase 5**, not Phase 6 —
approval takes time.

---

## 11. Company structure

The brochure gives a far more complete picture than either website. BBTC operates
**eleven locations including one in the United Kingdom.**

| Entity / office | Address |
| --- | --- |
| BBTC Production Controlling Section Office | 175 High Holborn Street, Rosewood London, Greater London, UK, WC1V 7AA |
| BBTC Head Office | 66/927 Pappurath Building, Krishnaswami Road, Pullepady, Ernakulam, Kerala 682035 |
| BBTC Ernakulam District Office | C-72/1112 Freedom Road, Kaloor PO, Cochin, Ernakulam 682017 |
| BBTC Machineries | 15/66 KVSN Compound, Chengaram, Palakkad 678681 |
| BBTC Foods & Beverages | 14/428/C Al-Badhar Complex, Praniyad, opp. Praniyad Juma Masjid, Mathilakam, Thrissur 680685 |
| BBTC Foods Products | 14/117/A Al-Badhar Complex, Praniyad, Mathilakam, Thrissur 680685 |
| BBTC Food Packing Centre | 4/410G Korad, Ozhur PO, Malappuram 676307 |
| BBTC Kasargod District Office | 28/5-A Kadavath, Thalangara PO, Kasaragod 671122 |
| Bright Blue Manufacturing Pvt Ltd | 15/67 KVSN Compound, Chengaram, Palakkad 678681 |
| Bright Blue Marketing Associates LLP | 28/8 Kadavath, Thalangara PO, Kasaragod 671122 |
| Bright Blue Chemicals LLP | 7/757 PH Building, Kozhinjamparambu, Kuzhalmannam, Palakkad 678702 *(brightblue.in only — absent from the brochure)* |

Collaborating manufacturers: Hanna Productions (Palakkad 678594), Ilfa Productions
(Chengaram 678681), AGP Enterprises (Malappuram 676553), Hannasagar Productions and
Shine Links Productions (both Kasaragod 671323).

Toll free 18001230621 · info@brightblue.in · also operates brightbluefmcg.com

**The UK office matters commercially.** It is a credible export or international-sales
signal that appears nowhere on either site, and it should be surfaced.

---

## 12. Build phases

Verify each phase's acceptance criteria before starting the next. Check items off as you go.

### Phase 0 — Foundation
- [ ] Next.js 15 + TypeScript strict + Tailwind v4 with §9 tokens
- [ ] Clash Display and Satoshi self-hosted
- [ ] Prisma on Neon, singleton client
- [ ] Auth.js v5, five roles, `/admin` gated in layout and middleware
- [ ] Cloudinary, Sentry, `.env.example`
- [ ] `lib/money.ts` and `lib/gst.ts` with passing unit tests

**Done when:** ADMIN can log in, CUSTOMER is rejected from `/admin` server-side, ₹149.00
round-trips as `14900`, and the GST split is correct for Kerala and non-Kerala.

### Phase 1 — Catalogue and admin CRUD
- [ ] Full schema migrated, including `Brand`, nested `Category`, `Entity`
- [ ] Seed: 7 brands, category tree, MX-3 with 24 fragrances, 11 locations, 3 users
- [ ] Admin: brands, categories, products, variants
- [ ] Cloudinary upload with reorder, required alt text, photography checklist inline
- [ ] Publish guards: no variant, no image, no price, no HSN, or missing food/cosmetic
      label fields blocks publish
- [ ] `AuditLog` on every product and price change

**Done when:** a manager creates a complete brand with variants and images through the UI
alone, and a food product cannot be published without its FSSAI label fields.

### Phase 2 — Storefront browse
- [ ] Header with brand-first and category-first nav, mobile drawer
- [ ] Announcement bar from `ContentBlock`
- [ ] Homepage: hero, **world record section**, claim badges, brand rail, category tiles,
      combo strip, founder story, reviews, where-to-buy teaser
- [ ] Brand pages `/brand/[slug]`
- [ ] Category pages with filter and sort
- [ ] Product page: gallery, **24-fragrance grid**, size and format selectors, claims,
      accordions, sticky mobile add-to-cart
- [ ] Null price renders "Price on request" with a contact link — never ₹0.00
- [ ] Search
- [ ] ISR 60s + on-demand revalidation
- [ ] `Product` and `Offer` JSON-LD, sitemap, canonicals

**Done when:** the whole catalogue is browsable, the fragrance grid works, Lighthouse
mobile ≥ 90, and there is zero placeholder imagery, lorem ipsum, or emoji.

### Phase 3 — Cart and pricing engine
- [ ] `lib/pricing.ts` per §8, every listed test passing
- [ ] Zustand cart holding IDs and quantities only
- [ ] Cart drawer with named offers and free-shipping progress
- [ ] Server-side recomputation on every cart read

**Done when:** all tests pass and a client-tampered price has no effect on totals.

### Phase 4 — Combos and discounts
- [ ] Combo builder with component picker, quantity, and choice slots
- [ ] Live saving panel: component sum, package price, saving in ₹ and %
- [ ] Combo pages with per-slot fragrance pickers
- [ ] Discount admin, all five types, form adapting per type
- [ ] **Discount preview against a sample cart before save** — mandatory
- [ ] Coupon entry with clear invalid-code messaging

**Done when:** a manager builds "any 3 MX-3 fragrances" and launches a tiered discount
unaided, and the preview matches the live cart.

### Phase 5 — Checkout, payments, orders
- [ ] One-page three-step checkout: contact, delivery, payment
- [ ] Guest checkout, phone OTP for returning customers
- [ ] Pincode auto-fill, serviceability, COD availability
- [ ] Razorpay order server-side; webhook with signature verification and idempotency
- [ ] COD with fee, allowlist, and value bounds
- [ ] Order transaction per §4
- [ ] Admin order list and detail with status transitions
- [ ] MSG91 templates submitted for approval

**Done when:** a ₹1 test transaction completes, the webhook moves the order to CONFIRMED,
inventory decrements, and replaying the webhook changes nothing.

### Phase 6 — Fulfilment, invoices, communications
- [ ] Shiprocket rate, push, AWB, label, tracking webhook
- [ ] Flat-rate slab fallback
- [ ] **GST invoice PDF with per-HSN summary table**, FSSAI number on food orders
- [ ] Invoice numbering sequential per FY, in-transaction, no gaps
- [ ] Resend confirmation with invoice attached
- [ ] WhatsApp notifications live with SMS fallback
- [ ] Customer tracking via order number + phone, no login

**Done when:** BBTC's accountant approves one generated mixed-rate invoice.

### Phase 7 — Content, reviews, polish
- [ ] Content admin: announcement, hero, world record block, story, featured, policies
- [ ] Retailer locator with district and pincode search, CSV import
- [ ] Reviews with moderation
- [ ] Account area: history, reorder, addresses
- [ ] Reports: sales, best sellers, discount performance, COD split, orders by state
- [ ] WCAG 2.1 AA audit
- [ ] Every empty and error state written per §9 voice

**Done when:** keyboard-only checkout completes and the AA audit passes.

### Phase 8 — Launch
- [ ] WooCommerce export, import, verify
- [ ] 301 map from every old brightblue.in URL
- [ ] Live Razorpay keys, webhook registered
- [ ] GA4, Search Console
- [ ] Load test the checkout path
- [ ] Staff training, recorded
- [ ] Rollback plan

---

## 13. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | LCP < 2.5s, INP < 200ms, CLS < 0.1 on mid-range Android over 4G. Lighthouse mobile ≥ 90. |
| Images | Cloudinary AVIF/WebP, explicit width and height, no layout shift |
| SEO | Server-rendered product pages, JSON-LD, canonicals, sitemap, per-product meta |
| Accessibility | WCAG 2.1 AA. Visible focus, keyboard-navigable swatch grid and drawers, errors linked to inputs, 4.5:1 contrast |
| Security | Server-side role checks on every mutation; Zod on every input; rate limits on OTP, login, coupons; secrets in env only; no PII in logs; webhook signature verification |
| Reliability | Order creation is one transaction; webhooks idempotent |
| Auditability | Every price, product, and discount change writes `AuditLog` |
| Browsers | Last 2 of Chrome, Safari, Firefox, Edge; Android Chrome; iOS Safari 15+ |

---

## 14. Open questions for BBTC

### Blocking — answer before the first migration

**1. MX-3 sizes — direct conflict between sources.**
The brochure states 900 ml / 450 ml / 225 ml. brightblue.in sells 250 ml / 500 ml / 1 L
with real prices (₹70 / ₹118–160 / ₹240–320). These are different product lines, a
repack, or one source is stale. This determines the entire variant matrix.

**2. MX-3 fragrance list — the two sources disagree.**
The record is for 24 fragrances, and both sources list 24-ish, but not the same 24.
Present only in the brochure: Coconut, Cherry, Blackberry, Watermelon, Tulsi.
Present only on the website: Avocado, Green Mango, Mango, Peach, Pista, Strawberry,
Passion Fruit, Papaya, Lychee, Pomegranate.
The record claim makes the canonical list of exactly 24 legally and commercially
significant. Get it in writing.

**3. Is `MX-3` two products or one?**
The site sells both "Liquid" and "Semi-Gel" at a consistent ~33% premium. Confirm whether
Semi-Gel is a format axis across all fragrances or a separate line.

**4. FSSAI licence number and scope.** Does it cover online sale of the full Kenzaniya
and Ilfa Valley ranges? If not, most of the catalogue cannot list.

**5. Cosmetics licence for Fairoze.** Manufacturing licence number and label declarations.

**6. Seller of record and the GSTIN problem.**
brightblue.in publishes **the same GSTIN, `32AAICB5392H1ZN`, for two different entities** —
Bright Blue Manufacturing Pvt Ltd and Bright Blue Chemicals LLP, at different Palakkad
addresses. Two entities cannot share a GSTIN. Which entity sells online, and what is its
correct GSTIN? Invoicing cannot be built until this is settled.

### Before Phase 2

7. **Full SKU list with prices** for all seven brands. Only five MX-3 SKUs currently have
   a published price. Include MRP as well as selling price — the "you save ₹X" block needs
   both — plus filled weight in grams for shipping.
8. **Fairoze sizes**, and confirmation of the full hand wash and body wash range.
9. **Kenzaniya sizes** for honey, nuts, seeds, and pickles. Only spices (250 ml) and ghee
   (900/450 ml) are stated.
10. **Landfloro name and variants.** The brochure says *Landfloro*, Rose and Butterfly
    Pea. The Vercel site says *Landfloor*, Rose Frees and Morning Dew. Which is correct?
11. **Rafasi variant list.** The brochure shows ten bottles at 2 L / 3 L / 5 L but the
    variant names are not legible in the scan.
12. **Founder story conflict.** The brochure says 2019 launched *Bright Blue Car Care
    Products Pvt Ltd*; the website says *Bright Blue Trading Corporation Pvt Ltd*. Both
    evolved into Bright Blue Manufacturing Pvt Ltd by 2023.
13. **Head office pincode.** The brochure header says 682035, its own footer says 682018.
14. **World record certificate** — a scan or photograph for the homepage section.
15. **One property or two?** Brand site at brightblue.in with the store at `/shop`, or
    merge them? And what happens to brightbluefmcg.com?
16. **Is Bright Blue Chemicals LLP still active?** It is on brightblue.in but absent from
    the July 2026 brochure.

### Before Phase 5

17. Shipping policy: free-shipping threshold, weight slabs, COD fee, COD pincodes.
18. Return policy — noting that food returns are governed differently from detergent.
19. Do food orders ship from the Thrissur or Malappuram food units rather than Palakkad,
    and does that change the delivery promise?
20. Is a B2B distributor login needed at launch, or is `wholesalePaise` parked for later?

---

## 15. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Catalogue is ~100+ SKUs with almost no published prices | **High** | Build the product admin early (Phase 1) so BBTC fills prices themselves rather than sending a spreadsheet |
| Three regulatory regimes — GST, FSSAI, cosmetics | **High** | Accountant sign-off on one mixed-rate invoice before launch; licence numbers confirmed in Phase 1 |
| Source conflicts on sizes and fragrance names | **High** | Questions 1, 2, 10, 11 block the migration. Do not guess. |
| Duplicate GSTIN across two entities | **High** | Question 6. Invoicing cannot ship without it. |
| Thin margins on low-ticket FMCG make paid shipping unviable | High | Model unit economics before setting thresholds; push combos to raise AOV |
| Photography for the non-MX-3 brands | Medium | MX-3 artwork exists for all 24 fragrances. Kenzaniya, Fairoze, and Rafasi need auditing — the brochure images are print assets, not necessarily web-ready at 2000px |
| COD return-to-origin, worse on food | Medium | Pincode allowlist at launch, expand on data |
| Scope creep into subscriptions or B2B | Medium | Both are explicit non-goals; log and don't build |
| Admin too complex for staff | Medium | Usability test Phase 4 with the actual person who will use it |

---

## 16. Out of scope for v1

Subscriptions, Malayalam UI, mobile apps, marketplace sync (Amazon, Flipkart, Blinkit),
a general CMS or page builder, loyalty points, referrals, gift cards, multi-currency,
international shipping. Log requests for these; do not build them.

---

## 17. Definition of done

- [ ] A manager adds a product, prices it, uploads images, and publishes — no developer
- [ ] A food product cannot be published without FSSAI label fields
- [ ] A manager builds a combo with a customer-chosen fragrance slot
- [ ] A manager launches a tiered discount and sees its effect before saving
- [ ] A customer completes a Razorpay purchase on mobile in under 90 seconds
- [ ] A customer completes a COD purchase and gets WhatsApp confirmation
- [ ] A mixed-rate order produces a correct per-HSN GST invoice, accountant-approved
- [ ] Lighthouse mobile ≥ 90 on home, brand, category, and product
- [ ] WCAG 2.1 AA passes
- [ ] Zero placeholder images, zero lorem ipsum, zero emoji, zero ₹0.00 prices
- [ ] All old brightblue.in URLs 301 to their new equivalents
