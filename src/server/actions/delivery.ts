'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkCodEligibility } from '@/lib/cod';
import { quoteDelivery } from '@/lib/delivery';
import { isPurchasable } from '@/lib/money';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { readCheckoutSettings } from '@/lib/settings';

/*
  "Check delivery" on the product page — brief §10, serviceability and rate by
  pincode before the customer reaches checkout.

  The same `quoteDelivery` checkout uses, so the answer here cannot disagree
  with the one charged. Rate-limited per IP because each call can reach
  Shiprocket's API on the store's account.
*/

const inputSchema = z.object({
  variantId: z.string().min(1).max(40),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/),
});

export type DeliveryCheckResult =
  | {
      ok: true;
      serviceable: boolean;
      /** Null when no delivery charge is configured to quote. */
      pricePaise: number | null;
      estimatedDays: number | null;
      codAvailable: boolean;
    }
  | { ok: false; error: string };

export async function checkDelivery(input: unknown): Promise<DeliveryCheckResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter a six-digit pincode.' };

  const ip = clientIpFrom(await headers());
  const limit = await checkRateLimit('delivery-check', ip, 20, 60);
  if (!limit.allowed) {
    return { ok: false, error: 'Too many checks just now. Try again in a minute.' };
  }

  const variant = await db.productVariant.findUnique({
    where: { id: parsed.data.variantId },
    select: { pricePaise: true, weightGrams: true, isActive: true },
  });
  if (!variant?.isActive || !isPurchasable(variant.pricePaise)) {
    return { ok: false, error: 'This product is not available to order online.' };
  }

  const settings = await readCheckoutSettings();
  const pricePaise = variant.pricePaise as number;

  const quote = await quoteDelivery({
    settings: settings.shipping,
    deliveryPincode: parsed.data.pincode,
    weightGrams: variant.weightGrams ?? settings.shipping.defaultUnitGrams,
    cod: false,
    declaredValuePaise: pricePaise,
  });

  const cod = checkCodEligibility(settings.cod, {
    subtotalPaise: pricePaise,
    pincode: parsed.data.pincode,
  });

  const priced = quote.source === 'shiprocket' || !settings.shippingUnconfigured;

  return {
    ok: true,
    serviceable: quote.serviceable,
    pricePaise: quote.serviceable && priced ? quote.pricePaise : null,
    estimatedDays: quote.estimatedDays,
    codAvailable: quote.serviceable && cod.eligible && quote.codServiceable !== false,
  };
}
