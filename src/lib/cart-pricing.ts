import 'server-only';
import { db } from '@/lib/db';
import { distributeProportionally } from '@/lib/money';
import { calculateCart, type CartLine, type DiscountInput, type PriceResult } from '@/lib/pricing';
import type { CartLineRef } from '@/lib/cart-store';

export interface CartDisplayItem {
  name: string;
  slug: string;
  sku?: string;
  imageUrl: string | null;
}

export interface CartPricingResult {
  result: PriceResult;
  /** Lines from the client cart that no longer resolve to a real, active, priced item. */
  unavailable: CartLineRef[];
  /** Keyed by `${kind}:${id}` — `calculateCart` only knows ids, not names or images. */
  display: Record<string, CartDisplayItem>;
  /**
   * How close the cart is to the cheapest active automatic FREE_SHIPPING
   * discount's minimum order — the cart drawer's "free-shipping progress".
   * There is no separate "free shipping threshold" setting in the schema;
   * this is derived from whichever real `FREE_SHIPPING` discount already
   * qualifies for it, so it never shows a number nobody configured.
   */
  freeShippingProgress: { thresholdPaise: number; remainingPaise: number } | null;
}

/**
 * Server-side recomputation on every cart read — brief §12 Phase 3's "done
 * when": a client-tampered price has no effect on totals. This function is
 * the only place that is true, because it is the only place a price is
 * looked up rather than trusted. It takes nothing from the client but IDs
 * and quantities.
 *
 * Combos have no HSN/GST fields of their own (open in the schema — see
 * DECISIONS.md). A combo line is exploded into one pricing line per
 * component, each carrying its own component's HSN/GST rate, with the
 * combo's package price apportioned across components by their own price
 * weight — the standard way to tax a mixed bundle. `kind: 'COMBO'` and the
 * combo's own id are kept on every exploded line so `DiscountScope.COMBO`
 * still matches correctly.
 */
export async function priceCart(
  cartLines: CartLineRef[],
  options: {
    discountCode?: string;
    shippingState?: string;
    shippingPaise?: number;
    codFeePaise?: number;
    paymentMethod: 'RAZORPAY' | 'COD';
    customerId?: string;
    customerUsage?: Record<string, number>;
  },
): Promise<CartPricingResult> {
  const unavailable: CartLineRef[] = [];
  const lines: CartLine[] = [];

  const variantIds = cartLines.filter((l) => l.kind === 'VARIANT').map((l) => l.id);
  const comboIds = cartLines.filter((l) => l.kind === 'COMBO').map((l) => l.id);

  const [variants, combos] = await Promise.all([
    variantIds.length > 0
      ? db.productVariant.findMany({
          where: { id: { in: variantIds } },
          include: { product: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        })
      : Promise.resolve([]),
    comboIds.length > 0
      ? db.combo.findMany({
          where: { id: { in: comboIds } },
          include: { items: { include: { variant: { include: { product: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  const variantById = new Map(variants.map((v) => [v.id, v]));
  const comboById = new Map(combos.map((c) => [c.id, c]));

  const display: Record<string, CartDisplayItem> = {};
  for (const v of variants) {
    display[`VARIANT:${v.id}`] = {
      name: v.variantName ? `${v.product.name} — ${v.variantName}` : v.product.name,
      slug: v.product.slug,
      sku: v.sku,
      imageUrl: v.images[0]?.url ?? null,
    };
  }
  for (const c of combos) {
    display[`COMBO:${c.id}`] = { name: c.name, slug: c.slug, imageUrl: c.imageUrl };
  }

  for (const cartLine of cartLines) {
    if (cartLine.kind === 'VARIANT') {
      const variant = variantById.get(cartLine.id);
      if (
        !variant ||
        !variant.isActive ||
        !variant.product.isActive ||
        variant.pricePaise === null ||
        !variant.product.hsnCode
      ) {
        unavailable.push(cartLine);
        continue;
      }
      lines.push({
        kind: 'VARIANT',
        id: variant.id,
        quantity: cartLine.quantity,
        unitPricePaise: variant.pricePaise,
        brandId: variant.product.brandId,
        categoryId: variant.product.categoryId,
        productId: variant.productId,
        hsnCode: variant.product.hsnCode,
        gstRate: variant.product.gstRate ?? 0,
      });
      continue;
    }

    // COMBO
    const combo = comboById.get(cartLine.id);
    if (!combo || !combo.isActive || combo.items.length === 0) {
      unavailable.push(cartLine);
      continue;
    }
    const taxableItems = combo.items.filter((item) => item.variant.product.hsnCode);
    if (taxableItems.length === 0) {
      unavailable.push(cartLine);
      continue;
    }

    const packageTotal = combo.pricePaise * cartLine.quantity;
    const weights = taxableItems.map((item) => (item.variant.pricePaise ?? 0) * item.quantity);
    const shares = distributeProportionally(packageTotal, weights);

    taxableItems.forEach((item, index) => {
      const share = shares[index];
      if (share <= 0) return;
      lines.push({
        kind: 'COMBO',
        id: combo.id,
        quantity: 1,
        unitPricePaise: share,
        brandId: item.variant.product.brandId,
        categoryId: item.variant.product.categoryId,
        productId: item.variant.productId,
        hsnCode: item.variant.product.hsnCode!,
        gstRate: item.variant.product.gstRate ?? 0,
      });
    });
  }

  const now = new Date();
  const automatic = await db.discount.findMany({
    where: { isActive: true, code: null, startsAt: { lte: now } },
  });
  const coupon = options.discountCode
    ? await db.discount.findFirst({
        where: {
          isActive: true,
          code: { equals: options.discountCode.trim().toUpperCase(), mode: 'insensitive' },
        },
      })
    : null;

  const candidateRows = coupon ? [...automatic, coupon] : automatic;
  const discounts: DiscountInput[] = candidateRows.map((d) => ({
    id: d.id,
    code: d.code,
    type: d.type,
    scope: d.scope,
    valuePaise: d.valuePaise,
    valueBps: d.valueBps,
    tiers: d.tiers as DiscountInput['tiers'],
    buyQty: d.buyQty,
    getQty: d.getQty,
    minOrderPaise: d.minOrderPaise,
    maxDiscountPaise: d.maxDiscountPaise,
    targetIds: d.targetIds,
    usageLimit: d.usageLimit,
    usageCount: d.usageCount,
    perCustomerLimit: d.perCustomerLimit,
    stackable: d.stackable,
    priority: d.priority,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    isActive: d.isActive,
  }));

  const result = calculateCart({
    lines,
    discounts,
    discountCode: options.discountCode,
    shippingState: options.shippingState,
    shippingPaise: options.shippingPaise,
    codFeePaise: options.codFeePaise,
    paymentMethod: options.paymentMethod,
    customerId: options.customerId,
    customerUsage: options.customerUsage,
    now,
  });

  const freeShippingThresholds = automatic
    .filter((d) => d.type === 'FREE_SHIPPING' && d.scope === 'ORDER' && d.minOrderPaise !== null)
    .map((d) => d.minOrderPaise!);
  const nearestThreshold =
    freeShippingThresholds.length > 0 ? Math.min(...freeShippingThresholds) : null;
  const freeShippingProgress =
    nearestThreshold === null
      ? null
      : {
          thresholdPaise: nearestThreshold,
          remainingPaise: Math.max(0, nearestThreshold - result.subtotalPaise),
        };

  return { result, unavailable, freeShippingProgress, display };
}
