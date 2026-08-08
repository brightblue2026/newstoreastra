import 'server-only';
import { db } from '@/lib/db';
import { distributeProportionally } from '@/lib/money';
import { calculateCart, type CartLine, type DiscountInput, type PriceResult } from '@/lib/pricing';
import { cartLineKey, type CartLineRef } from '@/lib/cart-line';
// `variantCoreSelect` below must keep producing rows that satisfy
// `ChoiceVariant`; the call site is what enforces it.
import { resolveComboUnits } from '@/lib/combo-choice';

export interface CartDisplayItem {
  name: string;
  slug: string;
  sku?: string;
  imageUrl: string | null;
  /** For a combo with choice slots: what the customer picked, in slot order. */
  choices?: { slotLabel: string; picks: string[] }[];
}

export interface CartPricingResult {
  result: PriceResult;
  /**
   * Index-aligned with `result.lines`: the key of the cart line each priced
   * line came from. `calculateCart` returns one result per line it was given,
   * in the same order, and a combo is handed to it as several component lines
   * that all carry the combo's own id — so id alone cannot map a priced line
   * back to the cart line the customer sees.
   */
  lineKeys: string[];
  /** Lines from the client cart that no longer resolve to a real, active, priced item. */
  unavailable: CartLineRef[];
  /** Keyed by `cartLineKey` — `calculateCart` only knows ids, not names or images. */
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

/** Everything pricing and labelling need from a variant, and nothing more. */
const variantCoreSelect = {
  id: true,
  productId: true,
  variantName: true,
  isActive: true,
  pricePaise: true,
  product: {
    select: {
      name: true,
      slug: true,
      isActive: true,
      brandId: true,
      categoryId: true,
      hsnCode: true,
      gstRate: true,
    },
  },
} as const;

/**
 * Server-side recomputation on every cart read — brief §12 Phase 3's "done
 * when": a client-tampered price has no effect on totals. This function is
 * the only place that is true, because it is the only place a price is
 * looked up rather than trusted. It takes nothing from the client but IDs,
 * quantities and choices — and a choice is re-checked against the slot's own
 * `choiceOf` restriction before it can affect what is sold.
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
  const lineKeys: string[] = [];

  const variantIds = cartLines.filter((l) => l.kind === 'VARIANT').map((l) => l.id);
  const comboIds = cartLines.filter((l) => l.kind === 'COMBO').map((l) => l.id);
  // Every variant a customer claims to have picked for a choice slot. Fetched
  // here rather than trusted: the slot's own included variant is not the one
  // being sold once a choice is made.
  const chosenIds = cartLines.flatMap((l) =>
    l.kind === 'COMBO' ? (l.choices ?? []).flatMap((choice) => choice.variantIds) : [],
  );

  const lookupIds = [...new Set([...variantIds, ...chosenIds])];

  const [variants, combos] = await Promise.all([
    lookupIds.length > 0
      ? db.productVariant.findMany({
          where: { id: { in: lookupIds } },
          select: {
            ...variantCoreSelect,
            sku: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
          },
        })
      : Promise.resolve([]),
    comboIds.length > 0
      ? db.combo.findMany({
          where: { id: { in: comboIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            pricePaise: true,
            isActive: true,
            items: {
              // Same order the combo page picked in, so the labels in the
              // drawer line up with the pickers that produced them.
              orderBy: { id: 'asc' },
              select: {
                id: true,
                quantity: true,
                isChoice: true,
                choiceOf: true,
                variant: { select: variantCoreSelect },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const variantById = new Map(variants.map((v) => [v.id, v]));
  const comboById = new Map(combos.map((c) => [c.id, c]));

  const display: Record<string, CartDisplayItem> = {};

  for (const cartLine of cartLines) {
    const key = cartLineKey(cartLine);

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
      display[key] = {
        name: variant.variantName
          ? `${variant.product.name} — ${variant.variantName}`
          : variant.product.name,
        slug: variant.product.slug,
        sku: variant.sku,
        imageUrl: variant.images[0]?.url ?? null,
      };
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
      lineKeys.push(key);
      continue;
    }

    // COMBO
    const combo = comboById.get(cartLine.id);
    if (!combo || !combo.isActive || combo.items.length === 0) {
      unavailable.push(cartLine);
      continue;
    }

    const resolved = resolveComboUnits(combo.items, cartLine, variantById);
    if (!resolved) {
      // A choice that no longer holds — a fragrance deactivated, a slot
      // resized since it was added, or a tampered payload. All three are the
      // same fix: this line has to be picked again, so it is named as
      // unavailable rather than quietly substituted for something else.
      unavailable.push(cartLine);
      continue;
    }

    const taxable = resolved.units.filter((unit) => unit.variant.product.hsnCode);
    if (taxable.length === 0) {
      unavailable.push(cartLine);
      continue;
    }

    display[key] = {
      name: combo.name,
      slug: combo.slug,
      imageUrl: combo.imageUrl,
      ...(resolved.chosenLabels.length > 0 ? { choices: resolved.chosenLabels } : {}),
    };

    const packageTotal = combo.pricePaise * cartLine.quantity;
    const weights = taxable.map((unit) => (unit.variant.pricePaise ?? 0) * unit.units);
    const shares = distributeProportionally(packageTotal, weights);

    taxable.forEach((unit, index) => {
      const share = shares[index];
      if (share <= 0) return;
      lines.push({
        kind: 'COMBO',
        id: combo.id,
        quantity: 1,
        unitPricePaise: share,
        brandId: unit.variant.product.brandId,
        categoryId: unit.variant.product.categoryId,
        productId: unit.variant.productId,
        hsnCode: unit.variant.product.hsnCode!,
        gstRate: unit.variant.product.gstRate ?? 0,
      });
      lineKeys.push(key);
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

  return { result, lineKeys, unavailable, freeShippingProgress, display };
}
