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

/** The seven houses, in their configured order. */
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
      select: {
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
      },
    });

    return products.map((product) => {
      // `orderBy pricePaise asc` puts NULLs last in Postgres, so the first
      // variant is the cheapest priced one when any price exists at all.
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
    });
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
 * Returns null until exactly one active seller exists. brief §14 Q6 is open:
 * brightblue.in publishes the same GSTIN for two different entities, which two
 * entities cannot share. Until that is resolved, printing a GSTIN would mean
 * picking one — so an ambiguous result prints nothing.
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
