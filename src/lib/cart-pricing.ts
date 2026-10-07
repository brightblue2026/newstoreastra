import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
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

/**
 * Everything an `OrderItem` snapshot needs, captured at the moment the cart was
 * priced. Index-aligned with `ResolvedCart.lines`, so the priced result can be
 * zipped straight onto it — a product edit after this point must never alter
 * what the order says was bought.
 *
 * A combo contributes **one snapshot per component**, each carrying that
 * component's own HSN and rate and the combo's id. `OrderItem.hsnCode` and
 * `gstRate` are not nullable and a bundle has neither of its own, so the
 * alternative would be inventing an HSN for a mixed package. Grouping by
 * `comboId` puts the package back together for the order detail; keeping the
 * components apart is what lets a mixed-rate invoice reconcile line by line.
 */
export interface OrderItemSnapshot {
  variantId: string | null;
  comboId: string | null;
  nameSnapshot: string;
  skuSnapshot: string;
  imageSnapshot: string | null;
  choiceSnapshot: { slotLabel: string; picks: string[] }[] | null;
  /** Physical units of this variant in the order, not the number of packages. */
  quantity: number;
  hsnCode: string;
  gstRate: number;
  weightGrams: number | null;
}

export interface ResolvedCart {
  /** Pricing input, in cart order. Combos are exploded into component lines. */
  lines: CartLine[];
  /** Index-aligned with `lines`: the `cartLineKey` each line came from. */
  lineKeys: string[];
  /** Index-aligned with `lines`: what to write onto an `OrderItem`. */
  snapshots: OrderItemSnapshot[];
  /** Lines from the client cart that no longer resolve to a real, active, priced item. */
  unavailable: CartLineRef[];
  /** Keyed by `cartLineKey` — `calculateCart` only knows ids, not names or images. */
  display: Record<string, CartDisplayItem>;
  /** Pre-discount goods total: what COD bounds and slab rating are judged on. */
  subtotalPaise: number;
  /** Billable weight, or null when no line in the cart has a weight recorded. */
  weightGrams: number | null;
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
  /** Index-aligned with `result.lines`, for the order transaction. */
  snapshots: OrderItemSnapshot[];
  /** Lines from the client cart that no longer resolve to a real, active, priced item. */
  unavailable: CartLineRef[];
  /** Keyed by `cartLineKey` — `calculateCart` only knows ids, not names or images. */
  display: Record<string, CartDisplayItem>;
  /** Billable weight, or null when nothing in the cart has a weight recorded. */
  weightGrams: number | null;
  /**
   * How close the cart is to the cheapest active automatic FREE_SHIPPING
   * discount's minimum order — the cart drawer's "free-shipping progress".
   * There is no separate "free shipping threshold" setting in the schema;
   * this is derived from whichever real `FREE_SHIPPING` discount already
   * qualifies for it, so it never shows a number nobody configured.
   */
  freeShippingProgress: { thresholdPaise: number; remainingPaise: number } | null;
}

/** Everything pricing, labelling, snapshotting and rating need from a variant. */
const variantCoreSelect = {
  id: true,
  productId: true,
  sku: true,
  variantName: true,
  size: true,
  weightGrams: true,
  isActive: true,
  pricePaise: true,
  images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
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

/** The display name for a variant: "MX-3 Dish Wash — Lemon". */
function variantLabel(variant: {
  variantName: string | null;
  product: { name: string };
}): string {
  return variant.variantName ? `${variant.product.name} — ${variant.variantName}` : variant.product.name;
}

/**
 * Turn the client's cart into priceable lines, using nothing from the client
 * but ids, quantities and choices.
 *
 * This is the security boundary — brief §12 Phase 3's "done when": a
 * client-tampered price has no effect on totals, because no price ever comes
 * from the client. A tampered *choice* is re-checked against the combo's own
 * slot restrictions in `resolveComboUnits` and rejected there.
 *
 * Combos have no HSN/GST fields of their own (open in the schema — see
 * DECISIONS.md). A combo line is exploded into one pricing line per component,
 * each carrying its own component's HSN/GST rate, with the combo's package
 * price apportioned across components by their own price weight — the standard
 * way to tax a mixed bundle. `kind: 'COMBO'` and the combo's own id are kept on
 * every exploded line so `DiscountScope.COMBO` still matches correctly.
 *
 * Separate from `priceCart` because the order transaction needs the resolved
 * lines *before* it can price them: shipping is rated on their weight and COD
 * eligibility on their subtotal, and both feed back into `calculateCart`.
 *
 * `client` exists so the order transaction can re-read every price through its
 * own transaction rather than outside it. §4 puts "re-read prices → re-run
 * pricing" *inside* the one `$transaction`, and reading through the singleton
 * would put it outside — a price edited between the read and the insert would
 * then be a price the order silently disagrees with.
 */
export async function resolveCartLines(
  cartLines: CartLineRef[],
  client: Prisma.TransactionClient = db,
): Promise<ResolvedCart> {
  const unavailable: CartLineRef[] = [];
  const lines: CartLine[] = [];
  const lineKeys: string[] = [];
  const snapshots: OrderItemSnapshot[] = [];

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
      ? client.productVariant.findMany({
          where: { id: { in: lookupIds } },
          select: variantCoreSelect,
        })
      : Promise.resolve([]),
    comboIds.length > 0
      ? client.combo.findMany({
          where: { id: { in: comboIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            pricePaise: true,
            isActive: true,
            weightGrams: true,
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
  let weightGrams: number | null = null;

  const addWeight = (grams: number | null, quantity: number) => {
    if (grams === null) return;
    weightGrams = (weightGrams ?? 0) + grams * quantity;
  };

  for (const cartLine of cartLines) {
    const key = cartLineKey(cartLine);

    if (cartLine.kind === 'VARIANT') {
      const variant = variantById.get(cartLine.id);
      if (
        !variant ||
        !variant.isActive ||
        !variant.product.isActive ||
        variant.pricePaise === null ||
        !variant.product.hsnCode ||
        // Unset is not 0%: nil-rated goods carry an explicit 0, and a missing
        // rate used to fall through as 0 — an 18% detergent sold untaxed.
        variant.product.gstRate === null
      ) {
        unavailable.push(cartLine);
        continue;
      }
      display[key] = {
        name: variantLabel(variant),
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
        gstRate: variant.product.gstRate!,
      });
      lineKeys.push(key);
      snapshots.push({
        variantId: variant.id,
        comboId: null,
        nameSnapshot: variantLabel(variant),
        skuSnapshot: variant.sku,
        imageSnapshot: variant.images[0]?.url ?? null,
        choiceSnapshot: null,
        quantity: cartLine.quantity,
        hsnCode: variant.product.hsnCode,
        gstRate: variant.product.gstRate!,
        weightGrams: variant.weightGrams,
      });
      addWeight(variant.weightGrams, cartLine.quantity);
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

    // Every component needs an HSN to be taxed correctly — silently dropping
    // the ones that don't (as a `.filter()` used to) would charge the full
    // package price while shipping fewer items than were paid for, taxed as
    // if the missing component was never part of the combo at all. Matches
    // the VARIANT branch above: one untaxable item makes the whole line
    // unavailable, not just that item.
    if (
      resolved.units.some(
        (unit) => !unit.variant.product.hsnCode || unit.variant.product.gstRate === null,
      )
    ) {
      unavailable.push(cartLine);
      continue;
    }

    const choiceSnapshot = resolved.chosenLabels.length > 0 ? resolved.chosenLabels : null;

    display[key] = {
      name: combo.name,
      slug: combo.slug,
      imageUrl: combo.imageUrl,
      ...(choiceSnapshot ? { choices: choiceSnapshot } : {}),
    };

    const packageTotal = combo.pricePaise * cartLine.quantity;
    const weights = resolved.units.map((unit) => (unit.variant.pricePaise ?? 0) * unit.units);
    const shares = distributeProportionally(packageTotal, weights);

    // A combo with its own packed weight spreads it across its units, rounded
    // up, so every weight sum downstream — the rate here, the Shiprocket
    // declaration later — sees the carton rather than the loose items.
    const unitsPerPackage = resolved.units.reduce((sum, unit) => sum + unit.units, 0);
    const comboUnitGrams =
      combo.weightGrams !== null && unitsPerPackage > 0
        ? Math.ceil(combo.weightGrams / unitsPerPackage)
        : null;

    resolved.units.forEach((unit, index) => {
      // No `share <= 0` early return: a component with a null/zero price (a
      // free sachet, say) gets a zero-paise line rather than vanishing from
      // the order — it still needs to be reserved, picked and shipped even
      // though it isn't what's being charged for.
      const share = shares[index];
      const variant = unit.variant;
      // Physical units shipped: this component's slot size times the number of
      // packages ordered.
      const physical = unit.units * cartLine.quantity;

      lines.push({
        kind: 'COMBO',
        id: combo.id,
        quantity: 1,
        unitPricePaise: share,
        brandId: variant.product.brandId,
        categoryId: variant.product.categoryId,
        productId: variant.productId,
        hsnCode: variant.product.hsnCode!,
        gstRate: variant.product.gstRate!,
      });
      lineKeys.push(key);
      snapshots.push({
        variantId: variant.id,
        comboId: combo.id,
        nameSnapshot: `${combo.name} — ${variantLabel(variant)}`,
        skuSnapshot: variant.sku,
        imageSnapshot: variant.images[0]?.url ?? combo.imageUrl,
        choiceSnapshot,
        quantity: physical,
        hsnCode: variant.product.hsnCode!,
        gstRate: variant.product.gstRate!,
        weightGrams: comboUnitGrams ?? variant.weightGrams,
      });
      addWeight(comboUnitGrams ?? variant.weightGrams, physical);
    });
  }

  const subtotalPaise = lines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);

  return { lines, lineKeys, snapshots, unavailable, display, subtotalPaise, weightGrams };
}

/**
 * Every discount worth considering for a cart: the automatic ones, plus the
 * coupon the customer typed if it names a real row. Which of them actually
 * apply is `calculateCart`'s decision, not this function's.
 */
export async function loadDiscountCandidates(
  discountCode?: string,
  client: Prisma.TransactionClient = db,
): Promise<{
  discounts: DiscountInput[];
  /** The automatic rows, for the free-shipping progress bar. */
  automatic: DiscountInput[];
}> {
  const now = new Date();
  const automaticRows = await client.discount.findMany({
    where: { isActive: true, code: null, startsAt: { lte: now } },
    // Without an explicit order, Postgres may return these rows in any
    // order, and `resolveConflicts`'s priority tiebreak in pricing.ts falls
    // back to array order when two exclusive discounts also tie on value —
    // which would otherwise make the winner nondeterministic between calls.
    orderBy: [{ priority: 'desc' }, { id: 'asc' }],
  });
  const couponRow = discountCode
    ? await client.discount.findFirst({
        where: {
          isActive: true,
          code: { equals: discountCode.trim().toUpperCase(), mode: 'insensitive' },
        },
      })
    : null;

  const toInput = (d: (typeof automaticRows)[number]): DiscountInput => ({
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
  });

  const automatic = automaticRows.map(toInput);
  const discounts = couponRow ? [...automatic, toInput(couponRow)] : automatic;
  return { discounts, automatic };
}

/** The cheapest automatic order-wide FREE_SHIPPING threshold, and how far the cart is from it. */
export function freeShippingProgressFrom(
  automatic: DiscountInput[],
  subtotalPaise: number,
): { thresholdPaise: number; remainingPaise: number } | null {
  const thresholds = automatic
    .filter((d) => d.type === 'FREE_SHIPPING' && d.scope === 'ORDER' && d.minOrderPaise !== null)
    .map((d) => d.minOrderPaise!);
  if (thresholds.length === 0) return null;
  const thresholdPaise = Math.min(...thresholds);
  return { thresholdPaise, remainingPaise: Math.max(0, thresholdPaise - subtotalPaise) };
}

/**
 * Server-side recomputation on every cart read: resolve the cart, then price
 * it. The two halves are separate functions because the order transaction has
 * to rate shipping and check COD in between.
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
  const resolved = await resolveCartLines(cartLines);
  const { discounts, automatic } = await loadDiscountCandidates(options.discountCode);

  const result = calculateCart({
    lines: resolved.lines,
    discounts,
    discountCode: options.discountCode,
    shippingState: options.shippingState,
    shippingPaise: options.shippingPaise,
    codFeePaise: options.codFeePaise,
    paymentMethod: options.paymentMethod,
    customerId: options.customerId,
    customerUsage: options.customerUsage,
    now: new Date(),
  });

  return {
    result,
    lineKeys: resolved.lineKeys,
    snapshots: resolved.snapshots,
    unavailable: resolved.unavailable,
    display: resolved.display,
    weightGrams: resolved.weightGrams,
    freeShippingProgress: freeShippingProgressFrom(automatic, result.subtotalPaise),
  };
}
