import 'server-only';
import { db } from '@/lib/db';
import type { Segment } from '@/generated/prisma/enums';
import type { NavBrand } from '@/components/Nav';
import type { ProductCardData } from '@/components/ProductCard';

/*
  Read models for the storefront.

  Each query degrades to an empty result rather than throwing. The homepage is
  the most-linked page on the site; a database hiccup should cost a section,
  not the whole page. Sections that receive nothing render nothing — see the
  guards in the homepage itself.
*/

export function segmentLabel(segment: Segment): string {
  return segment
    .toLowerCase()
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export type HouseBrand = NavBrand & {
  tagline: string | null;
  logoUrl: string | null;
};

/** The eight houses, in their configured order. */
export async function getBrands(): Promise<HouseBrand[]> {
  try {
    const brands = await db.brand.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        name: true,
        slug: true,
        accentHex: true,
        segment: true,
        tagline: true,
        logoUrl: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });

    return brands.map((brand) => ({
      name: brand.name,
      slug: brand.slug,
      accentHex: brand.accentHex,
      segmentLabel: segmentLabel(brand.segment),
      productCount: brand._count.products,
      tagline: brand.tagline,
      logoUrl: brand.logoUrl,
    }));
  } catch (error) {
    console.warn('[storefront] brands unavailable:', error);
    return [];
  }
}

/**
 * Featured products for the homepage grid.
 *
 * Takes the cheapest active variant as the card's price. A product whose
 * variants all have a null price still appears — it renders "Price on request",
 * which is the correct state for most of this catalogue right now, not a
 * reason to hide the product.
 */
export async function getFeaturedProducts(take = 8): Promise<ProductCardData[]> {
  try {
    const products = await db.product.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take,
      select: productCardSelect,
    });

    return products.map(toProductCard);
  } catch (error) {
    console.warn('[storefront] featured products unavailable:', error);
    return [];
  }
}

export type SellerEntity = {
  legalName: string;
  city: string | null;
  state: string | null;
  gstin: string | null;
};

/**
 * The entity of record for the footer.
 *
 * Returns null unless exactly one active seller exists. brief §14 Q6 (resolved
 * 9 August 2026, DECISIONS.md) turned out to be a brochure data error rather
 * than a real duplicate GSTIN — but the guard against an ambiguous result
 * stays: printing a GSTIN would mean picking one if a second seller ever gets
 * added by mistake, so it prints nothing instead.
 */
export async function getSellerEntity(): Promise<SellerEntity | null> {
  try {
    const sellers = await db.entity.findMany({
      where: { isActive: true, isSeller: true },
      select: { legalName: true, city: true, state: true, gstin: true },
      take: 2,
    });

    if (sellers.length !== 1) {
      if (sellers.length > 1) {
        console.warn(
          '[storefront] more than one active seller entity — omitting GSTIN from the footer (brief §14 Q6)',
        );
      }
      return null;
    }

    return sellers[0];
  } catch (error) {
    console.warn('[storefront] seller entity unavailable:', error);
    return null;
  }
}

export type ComboCard = {
  slug: string;
  name: string;
  shortDesc: string;
  imageUrl: string | null;
  pricePaise: number;
};

/** Featured combos for the offers rail. */
export async function getFeaturedCombos(take = 8): Promise<ComboCard[]> {
  try {
    return await db.combo.findMany({
      where: { isActive: true, isFeatured: true },
      take,
      select: {
        slug: true,
        name: true,
        shortDesc: true,
        imageUrl: true,
        pricePaise: true,
      },
    });
  } catch (error) {
    console.warn('[storefront] combos unavailable:', error);
    return [];
  }
}

/* ---------------------------------------------------------------- browse -- */

/**
 * The card projection, shared by every listing surface.
 *
 * Written once because /shop, /brands/[slug], /categories/[slug] and /search
 * must agree on what a product costs. Four hand-written copies of "take the
 * cheapest active variant" is four chances to disagree.
 */
const productCardSelect = {
  name: true,
  slug: true,
  brand: { select: { name: true, accentHex: true } },
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 2,
    select: { url: true, alt: true },
  },
  variants: {
    where: { isActive: true },
    orderBy: { pricePaise: 'asc' },
    select: { size: true, pricePaise: true, mrpPaise: true },
  },
} as const;

type ProductCardRow = {
  name: string;
  slug: string;
  brand: { name: string; accentHex: string };
  images: { url: string; alt: string }[];
  variants: { size: string; pricePaise: number | null; mrpPaise: number | null }[];
};

function toProductCard(product: ProductCardRow): ProductCardData {
  // `orderBy pricePaise asc` puts NULLs last in Postgres, so the first variant
  // is the cheapest priced one when any price exists at all.
  const lead = product.variants[0] ?? null;

  return {
    slug: product.slug,
    name: product.name,
    brandName: product.brand.name,
    accentHex: product.brand.accentHex,
    size: lead?.size ?? null,
    imageUrl: product.images[0]?.url ?? null,
    imageAlt: product.images[0]?.alt ?? null,
    hoverImageUrl: product.images[1]?.url ?? null,
    pricePaise: lead?.pricePaise ?? null,
    mrpPaise: lead?.mrpPaise ?? null,
  };
}

export const PRODUCT_SORTS = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  name: 'A–Z',
  newest: 'Newest',
} as const;

export type ProductSort = keyof typeof PRODUCT_SORTS;

export function isProductSort(value: string | undefined): value is ProductSort {
  return value !== undefined && value in PRODUCT_SORTS;
}

/*
  Sorting by price is deliberately *not* done in SQL.

  A null `pricePaise` means "Price on request", not "free". Postgres sorts NULLs
  last ascending and first descending, which would open the high-to-low list
  with every unpriced product in the catalogue — and right now that is most of
  it. Priced products are ordered in the database, then unpriced ones are
  appended in their configured order, at both ends. Everything else sorts in
  SQL where it belongs.
*/
function orderForSort(sort: ProductSort) {
  switch (sort) {
    case 'name':
      return [{ name: 'asc' as const }];
    case 'newest':
      return [{ createdAt: 'desc' as const }];
    case 'price-asc':
    case 'price-desc':
    case 'featured':
    default:
      return [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];
  }
}

function applyPriceSort(cards: ProductCardData[], sort: ProductSort): ProductCardData[] {
  if (sort !== 'price-asc' && sort !== 'price-desc') return cards;

  const priced = cards.filter((c) => c.pricePaise !== null);
  const unpriced = cards.filter((c) => c.pricePaise === null);

  priced.sort((a, b) =>
    sort === 'price-asc'
      ? (a.pricePaise as number) - (b.pricePaise as number)
      : (b.pricePaise as number) - (a.pricePaise as number),
  );

  return [...priced, ...unpriced];
}

export type ProductQuery = {
  brandSlug?: string;
  /** Matches the category itself and every descendant. */
  categorySlugs?: string[];
  segment?: Segment;
  search?: string;
  sort?: ProductSort;
  take?: number;
};

/** The one product listing query. Every browse surface goes through it. */
export async function listProducts(query: ProductQuery = {}): Promise<ProductCardData[]> {
  const { brandSlug, categorySlugs, segment, search, sort = 'featured', take = 96 } = query;

  try {
    const products = await db.product.findMany({
      where: {
        isActive: true,
        ...(brandSlug ? { brand: { slug: brandSlug } } : {}),
        ...(categorySlugs?.length ? { category: { slug: { in: categorySlugs } } } : {}),
        ...(segment ? { brand: { segment } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { shortDesc: { contains: search, mode: 'insensitive' as const } },
                { description: { contains: search, mode: 'insensitive' as const } },
                { brand: { name: { contains: search, mode: 'insensitive' as const } } },
                {
                  variants: {
                    some: {
                      isActive: true,
                      variantName: { contains: search, mode: 'insensitive' as const },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: orderForSort(sort),
      take,
      select: productCardSelect,
    });

    return applyPriceSort(products.map(toProductCard), sort);
  } catch (error) {
    console.warn('[storefront] product listing unavailable:', error);
    return [];
  }
}

export type BrandPage = HouseBrand & {
  story: string | null;
  segment: Segment;
  fssaiLicence: string | null;
  cosmeticLicence: string | null;
};

export async function getBrandBySlug(slug: string): Promise<BrandPage | null> {
  try {
    const brand = await db.brand.findFirst({
      where: { slug, isActive: true },
      select: {
        name: true,
        slug: true,
        accentHex: true,
        segment: true,
        tagline: true,
        story: true,
        logoUrl: true,
        fssaiLicence: true,
        cosmeticLicence: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });

    if (!brand) return null;

    return {
      name: brand.name,
      slug: brand.slug,
      accentHex: brand.accentHex,
      segment: brand.segment,
      segmentLabel: segmentLabel(brand.segment),
      productCount: brand._count.products,
      tagline: brand.tagline,
      story: brand.story,
      logoUrl: brand.logoUrl,
      fssaiLicence: brand.fssaiLicence,
      cosmeticLicence: brand.cosmeticLicence,
    };
  } catch (error) {
    console.warn('[storefront] brand unavailable:', error);
    return null;
  }
}

export type CategoryNode = {
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
};

export type CategoryPage = CategoryNode & {
  /** The category itself plus every descendant, for the product query. */
  slugs: string[];
  children: CategoryNode[];
  ancestors: { name: string; slug: string }[];
};

/**
 * A category page covers its whole subtree.
 *
 * "Kerala Spices" listing nothing because every product hangs off a child
 * range would be a bug, not a design. The tree is walked in application code
 * rather than a recursive CTE: this catalogue is two or three levels deep, and
 * a raw query would sit outside Prisma's typing for no practical gain.
 */
export async function getCategoryBySlug(slug: string): Promise<CategoryPage | null> {
  try {
    const all = await db.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });

    const self = all.find((c) => c.slug === slug);
    if (!self) return null;

    const byParent = new Map<string, typeof all>();
    for (const category of all) {
      if (!category.parentId) continue;
      const siblings = byParent.get(category.parentId) ?? [];
      siblings.push(category);
      byParent.set(category.parentId, siblings);
    }

    // Breadth-first over the subtree. `seen` guards against a parent cycle
    // surviving in the data; the admin's re-parenting guard should make that
    // impossible, but an infinite loop here would take the page down.
    const seen = new Set<string>([self.id]);
    const subtree = [self];
    for (let i = 0; i < subtree.length; i += 1) {
      for (const child of byParent.get(subtree[i].id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        subtree.push(child);
      }
    }

    const byId = new Map(all.map((c) => [c.id, c]));
    const ancestors: { name: string; slug: string }[] = [];
    let cursor = self.parentId ? byId.get(self.parentId) : undefined;
    const walked = new Set<string>();
    while (cursor && !walked.has(cursor.id)) {
      walked.add(cursor.id);
      ancestors.unshift({ name: cursor.name, slug: cursor.slug });
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }

    const toNode = (c: (typeof all)[number]): CategoryNode => ({
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      productCount: c._count.products,
    });

    return {
      ...toNode(self),
      slugs: subtree.map((c) => c.slug),
      children: (byParent.get(self.id) ?? []).map(toNode),
      ancestors,
    };
  } catch (error) {
    console.warn('[storefront] category unavailable:', error);
    return null;
  }
}

/** Top-level categories, for the /shop filter rail. */
export async function getTopCategories(): Promise<CategoryNode[]> {
  try {
    const categories = await db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });

    return categories.map((c) => ({
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      productCount: c._count.products,
    }));
  } catch (error) {
    console.warn('[storefront] categories unavailable:', error);
    return [];
  }
}

export type ProductVariantView = {
  id: string;
  sku: string;
  variantName: string | null;
  variantHex: string | null;
  size: string;
  format: string | null;
  pricePaise: number | null;
  mrpPaise: number | null;
  imageUrl: string | null;
};

export type ProductPage = {
  id: string;
  name: string;
  slug: string;
  shortDesc: string;
  description: string;
  hsnCode: string | null;
  gstRate: number | null;
  claims: { icon?: string; label: string }[];
  ingredients: string | null;
  usageSteps: string[];
  isFoodProduct: boolean;
  isCosmetic: boolean;
  foodLabel: Record<string, unknown> | null;
  countryOfOrigin: string | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  shelfLife: string | null;
  safetyWarnings: string | null;
  metaTitle: string | null;
  metaDesc: string | null;
  brand: {
    name: string;
    slug: string;
    accentHex: string;
    segment: Segment;
    segmentLabel: string;
    fssaiLicence: string | null;
    cosmeticLicence: string | null;
  };
  category: { name: string; slug: string };
  images: { url: string; alt: string }[];
  variants: ProductVariantView[];
};

/*
  `claims` and `usageSteps` are `Json` columns, so what comes back is `unknown`
  as far as the type system is concerned. These two coercions keep a malformed
  row from throwing on a page that is otherwise fine — the same posture as
  `lib/content.ts`: bad admin input costs a section, not the page.
*/
function readClaims(value: unknown): { icon?: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.label !== 'string' || record.label.length === 0) return [];
    return [
      {
        label: record.label,
        ...(typeof record.icon === 'string' ? { icon: record.icon } : {}),
      },
    ];
  });
}

function readSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string' && entry.length > 0) return [entry];
    if (typeof entry === 'object' && entry !== null) {
      const step = (entry as Record<string, unknown>).step;
      if (typeof step === 'string' && step.length > 0) return [step];
    }
    return [];
  });
}

export async function getProductBySlug(slug: string): Promise<ProductPage | null> {
  try {
    const product = await db.product.findFirst({
      where: { slug, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDesc: true,
        description: true,
        hsnCode: true,
        gstRate: true,
        claims: true,
        ingredients: true,
        usageSteps: true,
        isFoodProduct: true,
        isCosmetic: true,
        foodLabel: true,
        countryOfOrigin: true,
        manufacturerName: true,
        manufacturerAddress: true,
        shelfLife: true,
        safetyWarnings: true,
        metaTitle: true,
        metaDesc: true,
        brand: {
          select: {
            name: true,
            slug: true,
            accentHex: true,
            segment: true,
            fssaiLicence: true,
            cosmeticLicence: true,
          },
        },
        category: { select: { name: true, slug: true } },
        images: {
          where: { variantId: null },
          orderBy: { sortOrder: 'asc' },
          select: { url: true, alt: true },
        },
        variants: {
          where: { isActive: true },
          orderBy: [{ size: 'asc' }, { variantName: 'asc' }],
          select: {
            id: true,
            sku: true,
            variantName: true,
            variantHex: true,
            size: true,
            format: true,
            pricePaise: true,
            mrpPaise: true,
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    });

    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortDesc: product.shortDesc,
      description: product.description,
      hsnCode: product.hsnCode,
      gstRate: product.gstRate,
      claims: readClaims(product.claims),
      ingredients: product.ingredients,
      usageSteps: readSteps(product.usageSteps),
      isFoodProduct: product.isFoodProduct,
      isCosmetic: product.isCosmetic,
      foodLabel:
        product.foodLabel !== null && typeof product.foodLabel === 'object'
          ? (product.foodLabel as Record<string, unknown>)
          : null,
      countryOfOrigin: product.countryOfOrigin,
      manufacturerName: product.manufacturerName,
      manufacturerAddress: product.manufacturerAddress,
      shelfLife: product.shelfLife,
      safetyWarnings: product.safetyWarnings,
      metaTitle: product.metaTitle,
      metaDesc: product.metaDesc,
      brand: {
        name: product.brand.name,
        slug: product.brand.slug,
        accentHex: product.brand.accentHex,
        segment: product.brand.segment,
        segmentLabel: segmentLabel(product.brand.segment),
        fssaiLicence: product.brand.fssaiLicence,
        cosmeticLicence: product.brand.cosmeticLicence,
      },
      category: product.category,
      images: product.images,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        variantName: variant.variantName,
        variantHex: variant.variantHex,
        size: variant.size,
        format: variant.format,
        pricePaise: variant.pricePaise,
        mrpPaise: variant.mrpPaise,
        imageUrl: variant.images[0]?.url ?? null,
      })),
    };
  } catch (error) {
    console.warn('[storefront] product unavailable:', error);
    return null;
  }
}

export type ComboPage = {
  id: string;
  name: string;
  slug: string;
  shortDesc: string;
  description: string;
  imageUrl: string | null;
  pricePaise: number;
  items: {
    id: string;
    quantity: number;
    isChoice: boolean;
    variantName: string | null;
    size: string;
    format: string | null;
    pricePaise: number | null;
    productName: string;
    productSlug: string;
    brandName: string;
    accentHex: string;
    imageUrl: string | null;
    /** Fragrance options for a choice slot, already restricted per `choiceOf`. */
    options: { id: string; variantName: string | null; variantHex: string | null }[];
  }[];
  /** Sum of the components at their own prices, or null if any is unpriced. */
  componentSumPaise: number | null;
};

export async function getComboBySlug(slug: string): Promise<ComboPage | null> {
  try {
    const combo = await db.combo.findFirst({
      where: { slug, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDesc: true,
        description: true,
        imageUrl: true,
        pricePaise: true,
        items: {
          // `ComboItem` has no sort field, and an unordered fetch would let
          // the choice slots swap places between requests — so "Choose your
          // MX-3" could move under a different picker on a reload.
          orderBy: { id: 'asc' },
          select: {
            id: true,
            quantity: true,
            isChoice: true,
            choiceOf: true,
            variant: {
              select: {
                id: true,
                variantName: true,
                variantHex: true,
                size: true,
                format: true,
                pricePaise: true,
                images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
                product: {
                  select: {
                    name: true,
                    slug: true,
                    brand: { select: { name: true, accentHex: true } },
                    images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
                    variants: {
                      where: { isActive: true },
                      orderBy: { variantName: 'asc' },
                      select: { id: true, variantName: true, variantHex: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!combo) return null;

    let componentSum: number | null = 0;

    const items = combo.items.map((item) => {
      const { variant } = item;
      const { product } = variant;

      if (componentSum !== null) {
        // One unpriced component makes the whole "you save ₹X" claim unprovable,
        // so the saving panel is dropped rather than computed from a guess.
        componentSum =
          variant.pricePaise === null ? null : componentSum + variant.pricePaise * item.quantity;
      }

      // `choiceOf` restricts the slot; empty means any variant in the product.
      const allowed = new Set(item.choiceOf);
      const options = item.isChoice
        ? product.variants.filter((v) => allowed.size === 0 || allowed.has(v.id))
        : [];

      return {
        id: item.id,
        quantity: item.quantity,
        isChoice: item.isChoice,
        variantName: variant.variantName,
        size: variant.size,
        format: variant.format,
        pricePaise: variant.pricePaise,
        productName: product.name,
        productSlug: product.slug,
        brandName: product.brand.name,
        accentHex: product.brand.accentHex,
        imageUrl: variant.images[0]?.url ?? product.images[0]?.url ?? null,
        options,
      };
    });

    return {
      id: combo.id,
      name: combo.name,
      slug: combo.slug,
      shortDesc: combo.shortDesc,
      description: combo.description,
      imageUrl: combo.imageUrl,
      pricePaise: combo.pricePaise,
      items,
      componentSumPaise: componentSum,
    };
  } catch (error) {
    console.warn('[storefront] combo unavailable:', error);
    return null;
  }
}

// Stockist reads live in `lib/stockists.ts`, beside the locator's search.

/* --------------------------------------------------------------- sitemap -- */

export type SitemapEntry = { slug: string; updatedAt: Date };

export async function getSitemapData(): Promise<{
  products: SitemapEntry[];
  brands: SitemapEntry[];
  categories: { slug: string }[];
  combos: { slug: string }[];
}> {
  try {
    const [products, brands, categories, combos] = await Promise.all([
      db.product.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
      db.brand.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
      db.category.findMany({ where: { isActive: true }, select: { slug: true } }),
      db.combo.findMany({ where: { isActive: true }, select: { slug: true } }),
    ]);

    return { products, brands, categories, combos };
  } catch (error) {
    console.warn('[storefront] sitemap data unavailable:', error);
    return { products: [], brands: [], categories: [], combos: [] };
  }
}

/**
 * Approved reviews for one product, newest first.
 *
 * `isApproved` is in the `where`, not left to the caller: an unapproved review
 * must never reach the storefront, and a filter the caller has to remember is
 * a filter that eventually gets forgotten. The rating summary is computed from
 * exactly this list, so the average can never include something nobody has
 * read.
 */
export async function getApprovedReviews(productId: string) {
  try {
    return await db.review.findMany({
      where: { productId, isApproved: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        authorName: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
      },
    });
  } catch {
    // A product page that renders without its reviews is better than one that
    // 500s because of them — the same degrade the other readers here take.
    return [];
  }
}
