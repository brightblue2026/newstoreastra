# www.bbtcglobal.com — catalogue extract

Captured 16 August 2026 from `https://www.bbtcglobal.com/`. Single-page site; its
`sitemap.xml` lists exactly one URL, so this is the whole of it. `www.brightbluefmcg.com`,
referenced from the page as the "FMCG portal", is a parked Hostinger domain with no content.

**Status of this document: secondary source.** It records what BBTC publishes about itself
in public. Where it disagrees with the client's supplied documents (labels, FSSAI
registrations, GST registration), **the documents win** — that is how the MX-3 size conflict
was settled in `DECISIONS.md`, and brightblue.in's brochure has already been wrong once.
The site lists no prices and no HSN codes, so nothing here is grounds for seeding either.

## Brands — eight, not seven

The page's own words: "The company operates eight brands: MX-3, Landfloro, ANSAF, Ilfa
Valley, Kenzaniya, Rafasi, Fairoze, and MAKAFA."

**MAKAFA is new.** It appears in neither the master brief §3/§11 brand list, nor
`prisma/seed-brands.ts`, nor `CLAUDE.md`, nor anywhere else in this repo.

| Brand | Category as written on site | In repo? |
|---|---|---|
| MX-3 | Dish Care | seeded, 72 variants |
| Rafasi | Fabric Care | brand shell only |
| Landfloro | Home & Floor Care | brand shell only |
| Fairoze | Personal Care | brand shell only |
| ANSAF | Professional Car Care | brand shell only |
| Ilfa Valley | Premium Tea & Herbal Beverages | brand shell only |
| Kenzaniya | Pure Foods & Wellness | brand shell only |
| **MAKAFA** | **Premium Perfume & Fragrance** | **absent entirely** |

The site spells the personal care brand **Fairoze** in the brand list and **FAIROZ** in the
section heading. The repo uses `Fairoze`. Unresolved — one of them is wrong.

## Products

No prices anywhere on the site. Consistent with the "Price on request" rule; not grounds to
seed a price.

### MX-3 — Dish Care
Dishwash Liquid. 900ml / 450ml / 225ml. "24 Refreshing Fragrances" — **the site does not
name them**; the repo's 24 named fragrances come from label photographs and remain the
better source. Claims: tough on grease, balanced pH, gentle on hands, rich foam.

### Rafasi — Fabric Care
Cloth Wash Liquid. Fragrance: Rose & Jasmine. **Separate Front Load and Top Load
formulations** — a variant axis not currently modelled anywhere. Claims: deep-cleans
everyday fabrics, colour preservation, gentle formula.

### Landfloro — Home & Floor Care
Floor Cleaner. 1 Litre. Variants: **Rose Frees**, **Morning Dew**. ("Rose Frees" is
reproduced as written — likely "Rose Fresh", but not corrected here.) Claims: "7X Better
Long Lasting", clinically tested, germ elimination.

### ANSAF — Professional Car Care
"Sparkle & Shine" Car Wash. 1L / 500ml. Claims: Bio-Enzyme Formula, Safe For All Paints.

### Fairoze — Personal Care
Hand wash, body wash. No pack sizes given. Claims: pH-balanced, barrier-friendly, moisture
retention. Still has no cosmetics licence on file (open question 5).

### Ilfa Valley — Beverages
| Product | Pack | Claims |
|---|---|---|
| Premium Tea | 1kg jar | 100% Natural |
| Herbal Tea Bags | 25 bags | Caffeine Free, Aids Digestion |

### Kenzaniya — Foods & Wellness
| Product | Pack | Claims |
|---|---|---|
| Himalayan Pink Salt | 1kg jar | 100% Natural, No Additives |
| Multi Sweet Seed Mix | not stated | Rich In Protein, High In Fibre, No Preservatives |
| Marayoor Sharkara | not stated | Natural Goodness, Rich In Minerals |
| Pure Ghee | not stated | Traditionally prepared, 100% Pure, Rich Aroma |

The master brief also attributes honey, spices, nuts and pickles to Kenzaniya. The site
shows only these four.

### MAKAFA — Premium Fragrance
Perfume collection. No variants, pack sizes or prices given. Claims: long-lasting, "global
inspiration", premium quality.

## FSSAI scope gap — needs raising with the client

Cross-referencing the four Kenzaniya products and two Ilfa Valley products against the two
Basic Registrations in `DECISIONS.md` open question 4:

- `21325201000650` — scoped to **Biscuit, Tea**
- `21326201000001` — scoped to Ghee, Pickles, Pickled eggs, Cured/pickled meat, Rice, Wheat,
  Millets, Chia seeds, Arrowroot, maize flour, mixed millet flour, multigrain atta, ragi
  flour, barley flour, bread

| Product | Covered? |
|---|---|
| Ilfa Valley Premium Tea | yes — "Tea" |
| Ilfa Valley Herbal Tea Bags | unclear — a caffeine-free herbal infusion is not obviously "Tea" |
| Kenzaniya Pure Ghee | yes — "Ghee" |
| Kenzaniya Himalayan Pink Salt | **no** — salt appears in neither registration |
| Kenzaniya Marayoor Sharkara | **no** — jaggery appears in neither registration |
| Kenzaniya Multi Sweet Seed Mix | **unclear** — "Chia seeds" is listed; a mixed sweet seed product is not |

BBTC is publicly marketing at least two food products that fall outside both registrations'
scope. This is a live compliance question about the existing business, not a store-build
question — the store merely can't publish them until it is answered. Note also the ₹12 lakh
per-registration annual turnover cap already recorded in open question 4.

## Company details

Founded 2019 as Bright Blue Trading Corporation; "evolved into Bright Blue Manufacturing Pvt
Ltd by 2023" — consistent with the manufacturer/seller split already resolved in open
question 6, and not a contradiction of it.

Founder / CMD: **V.K. Faisal**.

Mission, as written: "delivering premium quality, affordable and innovative household
products — made in India, made with care." Values: "Trust · Quality · Commitment".

| Office | Address |
|---|---|
| Head office | C-72/1112, Freedom Road, Kaloor PO, Cochin, Ernakulam, Kerala 682017 |
| Manufacturing | Bright Blue Manufacturing Pvt Ltd, 15/67 KVSN Compound, Chengaram, Palakkad 678681 |
| Marketing | Bright Blue Marketing Associates LLP, 28/8 Kadavath, Thalangara PO, Kasaragod, Kerala 671122 |
| International | 175 High Holborn Street, Rosewood London, Greater London, UK WC1V 7AA |

Plus **nine branch offices across Kerala**. The site's head-office address (Kaloor) differs
from the GST registration's principal place of business (66/927 Pappurath, Pullepady, Kochi
682035) — but Kaloor is one of the four *additional* places of business on the same GSTIN,
so both are real and this is not a conflict. Invoices must carry the GST principal place.

Contact: toll free **1800 123 0621**, email **bbtcglobal@gmail.com**. The toll-free number
still cannot host WhatsApp Business — see `docs/msg91-templates.md`.

**Group companies:** Bright Blue Marketing Associates LLP, Hanna Productions, Ilfa
Productions, AGP Enterprises, Hannasagar Productions, Shine Links Productions. Only the
first appears in the seeded entities; the other five are new here. None is evidenced as a
seller of record, so none affects `Entity.isSeller`.

Recognition: MX-3 in the International Book of Records. No ISO/GMP/FDA certifications, no
export markets, no distributor process and no social links are stated on the site.

## Navigation

Our Story · Collection · Brand Stories · Branch Offices · Group Companies · Get In Touch

"Branch Offices" and "Group Companies" are top-level destinations on BBTC's own site and
have no equivalent in the store's information architecture.
