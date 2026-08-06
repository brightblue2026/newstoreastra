'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { priceCart } from '@/lib/cart-pricing';
import type { CartLineRef } from '@/lib/cart-store';

/*
  Reading the cart.

  The client holds ids and quantities; this returns what they cost. Every
  price, HSN code and GST rate is re-fetched from Postgres inside `priceCart` —
  nothing priced crosses the boundary inward, so a tampered localStorage cart
  changes what is *asked for*, never what it costs.

  It is a server action rather than a route handler because it is a read the UI
  performs, not a webhook. It writes nothing, so it needs no CSRF ceremony
  beyond what Next already applies to actions.
*/

const cartLineSchema = z.object({
  kind: z.enum(['VARIANT', 'COMBO']),
  // cuid-shaped, but not asserted as one: an id that doesn't resolve is
  // already handled as `unavailable` below, and a stricter check here would
  // only turn a recoverable state into an error.
  id: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(999),
});

const readCartSchema = z.object({
  // A bound on the request, not a business rule about cart size.
  lines: z.array(cartLineSchema).max(100),
  discountCode: z.string().trim().max(64).optional(),
});

export type CartViewLine = {
  kind: 'VARIANT' | 'COMBO';
  id: string;
  quantity: number;
  name: string;
  slug: string;
  sku?: string;
  imageUrl: string | null;
  unitPricePaise: number;
  subtotalPaise: number;
  discountPaise: number;
  netPaise: number;
};

export type CartView = {
  lines: CartViewLine[];
  /** Lines the client still holds that no longer resolve to a priceable item. */
  unavailable: CartLineRef[];
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  appliedDiscounts: { id: string; label: string; amountPaise: number }[];
  invalidDiscountCode: boolean;
  freeShippingProgress: { thresholdPaise: number; remainingPaise: number } | null;
};

export async function readCart(input: unknown): Promise<CartView> {
  const parsed = readCartSchema.safeParse(input);

  if (!parsed.success) {
    // A malformed cart is an empty cart. There is no user-correctable mistake
    // to report here — nobody types this payload.
    return {
      lines: [],
      unavailable: [],
      subtotalPaise: 0,
      discountPaise: 0,
      totalPaise: 0,
      appliedDiscounts: [],
      invalidDiscountCode: false,
      freeShippingProgress: null,
    };
  }

  const { lines, discountCode } = parsed.data;

  const { result, unavailable, display, freeShippingProgress } = await priceCart(lines, {
    discountCode,
    // Pre-checkout: no address yet, so no shipping and no COD fee. The drawer
    // shows a subtotal, never a final payable — that is settled at checkout,
    // where the delivery state also decides CGST/SGST vs IGST.
    paymentMethod: 'RAZORPAY',
  });

  /*
    `calculateCart` returns discount ids, not customer-facing names — it is a
    pure function with no database access, which is what makes it testable.
    The label lookup therefore happens here. `Discount.name` is marked internal
    in the schema and is never shown; `publicLabel` is the field meant for a
    cart line, and a coupon falls back to the code the customer typed.
  */
  const discountIds = result.appliedDiscounts.map((d) => d.discountId);
  const labels = new Map<string, string | null>();

  if (discountIds.length > 0) {
    try {
      const rows = await db.discount.findMany({
        where: { id: { in: discountIds } },
        select: { id: true, publicLabel: true },
      });
      for (const row of rows) labels.set(row.id, row.publicLabel);
    } catch (error) {
      console.warn('[cart] discount labels unavailable:', error);
    }
  }

  /*
    Collapse the priced lines back to one row per cart line.

    `priceCart` explodes a combo into one pricing line per component so each
    carries its own component's HSN and GST rate — correct for tax, wrong for a
    drawer, where a three-component combo is one thing the customer chose.
    Rows are grouped by `kind:id` and their money summed; the quantity comes
    from the client's own cart line, because every exploded component line
    carries quantity 1 regardless of how many combos were added.

    Summing rather than recomputing is what keeps the drawer reconciled with
    the total: `distributeProportionally` guarantees the component shares add
    back up to the package price exactly, so `subtotal / quantity` is the combo
    price to the paise, with no rounding reintroduced here.
  */
  const requested = new Map(lines.map((line) => [`${line.kind}:${line.id}`, line.quantity]));
  const grouped = new Map<string, CartViewLine>();

  for (const line of result.lines) {
    const key = `${line.kind}:${line.id}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.subtotalPaise += line.subtotalPaise;
      existing.discountPaise += line.discountPaise;
      existing.netPaise += line.netPaise;
      existing.unitPricePaise = Math.round(existing.subtotalPaise / existing.quantity);
      continue;
    }

    const shown = display[key];
    const quantity = requested.get(key) ?? line.quantity;

    grouped.set(key, {
      kind: line.kind,
      id: line.id,
      quantity,
      name: shown?.name ?? 'Item',
      slug: shown?.slug ?? '',
      sku: shown?.sku,
      imageUrl: shown?.imageUrl ?? null,
      unitPricePaise: Math.round(line.subtotalPaise / quantity),
      subtotalPaise: line.subtotalPaise,
      discountPaise: line.discountPaise,
      netPaise: line.netPaise,
    });
  }

  return {
    lines: [...grouped.values()],
    unavailable,
    subtotalPaise: result.subtotalPaise,
    discountPaise: result.discountPaise,
    // Shipping and any COD fee are zero here, so this is the goods total.
    totalPaise: result.totalPaise,
    appliedDiscounts: result.appliedDiscounts.map((discount) => ({
      id: discount.discountId,
      label: labels.get(discount.discountId) ?? discount.code ?? 'Offer applied',
      amountPaise: discount.amountPaise,
    })),
    invalidDiscountCode: result.invalidDiscountCode,
    freeShippingProgress,
  };
}
